const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class SosoAPIClient {
    constructor(accountIndex = 0) {
        this.accountIndex = accountIndex;
        this.proxyIP = null;
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://game.sosovalue.com",
            "Referer": "https://game.sosovalue.com/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        };
        this.proxyList = fs.readFileSync(path.join(__dirname, 'proxy.txt'), 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    }

    async log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
        const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : '[Unknown IP]';
        let logMessage = '';
        
        switch(type) {
            case 'success':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
                break;
            case 'error':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
                break;
            case 'warning':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
                break;
            default:
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
        }
        
        console.log(`[${timestamp}] ${logMessage}`);
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { 
                httpsAgent: proxyAgent,
                timeout: 10000 
            });
            if (response.status === 200) {
                return response.data.ip;
            }
            throw new Error(`Unable to verify proxy IP. Status code: ${response.status}`);
        } catch (error) {
            throw new Error(`Error checking proxy IP: ${error.message}`);
        }
    }

    async makeRequest(method, url, options = {}) {
        if (this.currentProxy) {
            const proxyAgent = new HttpsProxyAgent(this.currentProxy);
            options.httpsAgent = proxyAgent;
        }
        try {
            const response = await axios({
                method,
                url,
                ...options,
                timeout: 30000
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    parseInitData(initData) {
        const userDataStr = decodeURIComponent(initData.split('user=')[1].split('&')[0]);
        const userData = JSON.parse(userDataStr);
        const hash = initData.split('hash=')[1];
        const authDate = initData.split('auth_date=')[1].split('&')[0];

        return {
            authDate,
            firstName: userData.first_name,
            lastName: userData.last_name || "",
            oauthToken: hash,
            photoUrl: userData.photo_url || "",
            thirdpartyId: userData.id.toString(),
            thirdpartyName: "telegram",
            username: userData.username,
            invitationCode: null,
            invitationFrom: null
        };
    }

    async login(initData) {
        const url = "https://gw.sosovalue.com/usercenter/user/thirdPartyLoginWithUserInfo";
        const payload = this.parseInitData(initData);

        try {
            const response = await this.makeRequest('post', url, {
                data: payload,
                headers: this.headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    token: response.data.data.authInfo.token,
                    userId: response.data.data.authInfo.userId
                };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGameToken(token) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/gameLogin";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };
        try {
            const response = await this.makeRequest('get', url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, tgGameToken: response.data.data.tgGameToken };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getBasicParams(token, tgGameToken) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/home/getBasicParamConfig";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        try {
            const response = await this.makeRequest('get', url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async useEnergy(token, tgGameToken, params) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/home/uploadClickExp";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        const payload = {
            ...params,
            energyIncrement: params.ownerEnergy,
            clickExpIncrement: params.ownerEnergy - 1,
            reportTime: Date.now(),
            currentEnergy: params.ownerEnergy,
            currentTotalExp: params.totalExp + params.ownerEnergy - 1
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: payload,
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getBoostInfo(token, tgGameToken) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/boost/queryBasicInfo";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        try {
            const response = await this.makeRequest('get', url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, boosters: response.data.data.boosters };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async upgradeBoost(token, tgGameToken, boostInfoId, currentLevel) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/boost/upgrade";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        const payload = {
            boostInfoId: boostInfoId,
            currentLevel: currentLevel
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: payload,
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    data: response.data.data,
                    nextCost: response.data.data.upgradeNeedCostExp
                };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processBoostUpgrades(token, tgGameToken, totalExp) {
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        if (!config.general.enableAutoUpgrade) {
            this.log('Tự động nâng cấp bị tắt trong config.json', 'info');
            return;
        }

        const boostInfo = await this.getBoostInfo(token, tgGameToken);
        if (!boostInfo.success) {
            this.log(`Lỗi rồi: ${boostInfo.error}`, 'error');
            return;
        }

        const sortedBoosters = boostInfo.boosters.sort((a, b) => {
            const aPriority = config.boosts[a.boostName].priority;
            const bPriority = config.boosts[b.boostName].priority;
            return aPriority - bPriority;
        });

        for (const booster of sortedBoosters) {
            const boostConfig = config.boosts[booster.boostName];
            if (!boostConfig) continue;

            const upgradeCost = parseInt(booster.upgradeNeedCostExp);
            const currentLevel = parseInt(booster.currentLevel);
            const availableExp = totalExp - config.general.minBalanceToKeep;

            if (currentLevel < boostConfig.maxLevel && availableExp >= upgradeCost) {
                this.log(`Đang nâng cấp ${booster.boostName}...`, 'info');
                const upgradeResult = await this.upgradeBoost(token, tgGameToken, booster.boostInfoId, currentLevel);

                if (upgradeResult.success) {
                    this.log(`Nâng cấp thành công ${booster.boostName} lên level ${upgradeResult.data.currentLevel}`, 'success');
                    this.log(`Nâng cấp tiếp theo cần ${upgradeResult.nextCost} exp`, 'custom');
                    totalExp -= upgradeCost;
                } else {
                    this.log(`Nâng cấp thất bại ${booster.boostName}: ${upgradeResult.error}`, 'error');
                }
            }
        }
    }

    async getSignInInfo(token, tgGameToken) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/signIn/querySignInInfo";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: {},
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async performSignIn(token, tgGameToken) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/signIn/signIn";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: {},
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                const signInData = response.data.data;
                this.log(
                    `Check in thành công ngày ${signInData.userConsecutiveSignInDay} | Nhận ${signInData.signInRewardAmount} exp`,
                    'success'
                );
                return { success: true, data: signInData };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processSignIn(token, tgGameToken) {
        const signInInfo = await this.getSignInInfo(token, tgGameToken);

        if (!signInInfo.success) {
            this.log(`Không đọc được thông tin checkin: ${signInInfo.error}`, 'error');
            return;
        }

        if (signInInfo.data.todaySignInStatus === 0) {
            this.log('Chưa checkin hôm nay, thực hiện checkin...', 'info');
            const signInResult = await this.performSignIn(token, tgGameToken);

            if (!signInResult.success) {
                this.log(`Không thể checkin: ${signInResult.error}`, 'error');
            }
        } else {
            this.log(`Hôm nay bạn đã checkin ngày ${signInInfo.data.userConsecutiveSignInDay}`, 'warning');
        }
    }

    async getTaskList(token, tgGameToken) {
        const url = "https://gw.sosovalue.com/task/task-config-do/v1/queryTaskList";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: { activityType: "2" },
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async changeTaskStatus(token, tgGameToken, taskId) {
        const url = "https://gw.sosovalue.com/task/task/support/changeTaskStatus";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        const payload = {
            activityType: 2,
            targetTaskStatus: 2,
            taskId: taskId
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: payload,
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkRoutineTask(token, tgGameToken, taskId) {
        const url = "https://gw.sosovalue.com/task/task/support/checkRoutineTask";
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Tggametoken": tgGameToken
        };

        const payload = {
            activityType: 2,
            taskId: taskId
        };

        try {
            const response = await this.makeRequest('post', url, {
                data: payload,
                headers
            });
            if (response.status === 200 && response.data.code === 0) {
                if (response.data.data.checkResult) {
                }
                return { success: true, data: response.data.data };
            }
            return { success: false, error: response.data.msg };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processTask(token, tgGameToken, task) {
        if (task.taskKey && (task.taskKey.includes('INVITE') || task.taskKey === 'TG_GAME_DAILY_CHECK_IN')) {
            return;
        }

        const taskName = JSON.parse(task.taskName).en;

        if (task.completedCount >= task.completionLimit) {
            return;
        }

        if (task.taskDelayTime) {
            const currentTime = Date.now();
            const delayTime = parseInt(task.taskDelayTime);
            const remainingTime = Math.ceil((delayTime - currentTime) / 1000);
            this.log(`Nhiệm vụ "${taskName}" cần chờ ${remainingTime} giây - tạm thời bỏ qua`, 'warning');
            return;
        }

        if (task.taskStatus === 0) {
            this.log(`Bắt đầu nhiệm vụ: ${taskName}`, 'info');
            const statusChange = await this.changeTaskStatus(token, tgGameToken, task.id);

            if (!statusChange.success) {
                this.log(`Không thể bắt đầu nhiệm vụ: ${taskName} - ${statusChange.error}`, 'error');
                return;
            }

            const checkResult = await this.checkRoutineTask(token, tgGameToken, task.id);
            if (checkResult.success && checkResult.data.checkResult) {
                this.log(`Làm nhiệm vụ ${taskName} thành công | Phần thưởng: ${task.reward} exp`, 'success');
            } else {
                this.log(`Làm nhiệm vụ ${taskName} không thành công - ${checkResult.error || 'Unknown error'}`, 'error');
            }
        }
    }

    async processAllTasks(token, tgGameToken) {
        const taskListResult = await this.getTaskList(token, tgGameToken);

        if (!taskListResult.success) {
            this.log(`Không lấy được danh sách nhiệm vụ: ${taskListResult.error}`, 'error');
            return;
        }

        const allTasks = [
            ...(taskListResult.data.noviceTaskList || []),
            ...(taskListResult.data.growthTaskList || []),
            ...(taskListResult.data.dailyTaskList || []),
            ...(taskListResult.data.commonTaskList || [])
        ];

        for (const task of allTasks) {
            await this.processTask(token, tgGameToken, task);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    async processAccount(initData, timeout = 600000) {
        return new Promise(async (resolve) => {
            const timeoutId = setTimeout(() => {
                this.log('Quá trình xử lý tài khoản đã hết thời gian sau 10 phút', 'error');
                resolve();
            }, timeout);

            try {
                const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                const userId = userData.id;
                const firstName = userData.first_name;

                this.currentProxy = this.proxyList[this.accountIndex % this.proxyList.length];
                
                try {
                    this.proxyIP = await this.checkProxyIP(this.currentProxy);
                } catch (error) {
                    this.log(`Failed to check proxy IP: ${error.message}`, 'warning');
                }

                this.log(`Đang xử lý tài khoản: ${firstName}`, 'info');
                
                const loginResult = await this.login(initData);
                if (loginResult.success) {
                    const token = loginResult.token;
                    
                    const gameTokenResult = await this.getGameToken(token);
                    if (gameTokenResult.success) {
                        const tgGameToken = gameTokenResult.tgGameToken;
                        
                        const basicParams = await this.getBasicParams(token, tgGameToken);
                        if (basicParams.success) {
                            const params = basicParams.data;
                            this.log(`User Level: ${params.userLevel} | Total Exp: ${params.totalExp} | Energy: ${params.ownerEnergy}/${params.maxEnergy}`, 'info');
                            
                            await this.processSignIn(token, tgGameToken);
                            await this.processAllTasks(token, tgGameToken);
                            await this.processBoostUpgrades(token, tgGameToken, params.totalExp);
                            
                            if (params.ownerEnergy > 0) {
                                const useEnergyResult = await this.useEnergy(token, tgGameToken, params);
                                if (useEnergyResult.success) {
                                    this.log(`Sử dụng ${params.ownerEnergy} năng lượng`, 'success');
                                }
                            } else {
                                this.log('Không có năng lượng nào để sử dụng', 'warning');
                            }
                        }
                    }
                }
            } catch (error) {
                this.log(`Lỗi xử lý tài khoản: ${error.message}`, 'error');
            }

            clearTimeout(timeoutId);
            resolve();
        });
    }
}

if (!isMainThread) {
    const client = new SosoAPIClient(workerData.accountIndex);
    client.processAccount(workerData.initData)
        .then(() => parentPort.postMessage('done'))
        .catch(error => {
            console.error(`Worker error: ${error.message}`);
            parentPort.postMessage('done');
        });
}

if (isMainThread) {
    async function main() {
        const maxThreads = 10;
        const restPeriod = 300;
        
        while (true) {
            const dataFile = path.join(__dirname, 'data.txt');
            const accounts = fs.readFileSync(dataFile, 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);

            console.log(`Bắt đầu chu kỳ mới với ${accounts.length} tài khoản`);
            
            for (let i = 0; i < accounts.length; i += maxThreads) {
                const batch = accounts.slice(i, i + maxThreads);
                const workers = batch.map((initData, index) => {
                    const worker = new Worker(__filename, {
                        workerData: {
                            accountIndex: i + index,
                            initData
                        }
                    });
                    return new Promise(resolve => {
                        worker.on('message', resolve);
                        worker.on('error', resolve);
                        worker.on('exit', resolve);
                    });
                });

                await Promise.all(workers);
                console.log(`Completed batch of ${batch.length} accounts`);
            }

            console.log(`Nghỉ ${restPeriod} giây sau đó tiếp tục...`);
            await new Promise(resolve => setTimeout(resolve, restPeriod * 1000));
        }
    }

    main().catch(console.error);
}

module.exports = SosoAPIClient;