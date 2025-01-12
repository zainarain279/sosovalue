const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');

class SosoAPIClient {
    constructor() {
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
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [✓] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [✗] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [!] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [ℹ] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            const timestamp = new Date().toLocaleTimeString();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${timestamp}] [*] Wait ${i} seconds to continue...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
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
            const response = await axios.post(url, payload, { headers: this.headers });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    token: response.data.data.authInfo.token,
                    userId: response.data.data.authInfo.userId
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGameToken(token) {
        const url = "https://gw.sosovalue.com/tavern/api/tg/gameLogin";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };
        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, tgGameToken: response.data.data.tgGameToken };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.get(url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.get(url, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { success: true, boosters: response.data.data.boosters };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return { 
                    success: true, 
                    data: response.data.data,
                    nextCost: response.data.data.upgradeNeedCostExp
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processBoostUpgrades(token, tgGameToken, totalExp) {
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        if (!config.general.enableAutoUpgrade) {
            this.log('Automatic upgrade is disabled in config.json', 'info');
            return;
        }

        const boostInfo = await this.getBoostInfo(token, tgGameToken);
        if (!boostInfo.success) {
            this.log(`Error: ${boostInfo.error}`, 'error');
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
                this.log(`Upgrading ${booster.boostName}...`, 'info');
                const upgradeResult = await this.upgradeBoost(token, tgGameToken, booster.boostInfoId, currentLevel);
                
                if (upgradeResult.success) {
                    this.log(`Upgrade successful ${booster.boostName} go up level ${upgradeResult.data.currentLevel}`, 'success');
                    this.log(`Next upgrade required ${upgradeResult.nextCost} exp`, 'custom');
                    totalExp -= upgradeCost;
                } else {
                    this.log(`Upgrade failed ${booster.boostName}: ${upgradeResult.error}`, 'error');
                }
            } else if (currentLevel >= boostConfig.maxLevel) {
                this.log(`${booster.boostName} already at maximum configuration level (${currentLevel})`, 'info');
            } else if (availableExp < upgradeCost) {
                this.log(`Not enough exp to upgrade ${booster.boostName} (need ${upgradeCost}, Have ${availableExp})`, 'warning');
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
            const response = await axios.post(url, {}, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.post(url, {}, { headers });
            if (response.status === 200 && response.data.code === 0) {
                const signInData = response.data.data;
                this.log(
                    `Checkin successful date ${signInData.userConsecutiveSignInDay} | Receive ${signInData.signInRewardAmount} exp`,
                    'success'
                );
                return { success: true, data: signInData };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processSignIn(token, tgGameToken) {
        const signInInfo = await this.getSignInInfo(token, tgGameToken);
        
        if (!signInInfo.success) {
            this.log(`Cannot read check-in information: ${signInInfo.error}`, 'error');
            return;
        }

        if (signInInfo.data.todaySignInStatus === 0) {
            this.log('Not checked in today, check in...', 'info');
            const signInResult = await this.performSignIn(token, tgGameToken);
            
            if (!signInResult.success) {
                this.log(`Unable to check in: ${signInResult.error}`, 'error');
            }
        } else {
            this.log(`You checked in today ${signInInfo.data.userConsecutiveSignInDay}`, 'warning');
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
            const response = await axios.post(url, { activityType: "2" }, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200 && response.data.code === 0) {
                if (response.data.data.checkResult) {
                }
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
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
            this.log(`Mission "${taskName}" need to wait ${remainingTime} seconds - temporarily ignored`, 'warning');
            return;
        }
    
        if (task.taskStatus === 0) {
            this.log(`Start the mission: ${taskName}`, 'info');
            const statusChange = await this.changeTaskStatus(token, tgGameToken, task.id);
            
            if (!statusChange.success) {
                this.log(`Unable to start mission: ${taskName} - ${statusChange.error}`, 'error');
                return;
            }
    
            const checkResult = await this.checkRoutineTask(token, tgGameToken, task.id);
            if (checkResult.success && checkResult.data.checkResult) {
                this.log(`Do the task ${taskName} success | reward: ${task.reward} exp`, 'success');
            } else {
                this.log(`Do the task ${taskName} unsuccessful - ${checkResult.error || 'Unknown error'}`, 'error');
            }
        }
    }
    
    async processAllTasks(token, tgGameToken) {
        const taskListResult = await this.getTaskList(token, tgGameToken);
        
        if (!taskListResult.success) {
            this.log(`Unable to get task list: ${taskListResult.error}`, 'error');
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
    
    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let i = 0; i < data.length; i++) {
                const initData = data[i];
                const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                const userId = userData.id;
                const firstName = userData.first_name;

                console.log(`========== Account ${i + 1} | ${firstName.green} ==========`);
                
                const loginResult = await this.login(initData);
                if (loginResult.success) {
                    this.log('Đăng nhập thành công!', 'success');
                    const token = loginResult.token;
                    
                    const gameTokenResult = await this.getGameToken(token);
                    if (gameTokenResult.success) {
                        
                        const basicParams = await this.getBasicParams(token, gameTokenResult.tgGameToken);
                        if (basicParams.success) {
                            const params = basicParams.data;
                            this.log(`User Level: ${params.userLevel} | Total Exp: ${params.totalExp}`, 'custom');
                            this.log(`Energy: ${params.ownerEnergy}/${params.maxEnergy}`, 'custom');
                            this.log(`Multitap Level: ${params.multitapLevel}`, 'custom');
                            this.log(`Energy Limit Level: ${params.energyLimitLevel}`, 'custom');
                            await this.processSignIn(token, gameTokenResult.tgGameToken);
                            await this.processAllTasks(token, gameTokenResult.tgGameToken);
                            await this.processBoostUpgrades(token, gameTokenResult.tgGameToken, params.totalExp);
                            if (params.ownerEnergy > 0) {
                                const useEnergyResult = await this.useEnergy(token, gameTokenResult.tgGameToken, params);
                                if (useEnergyResult.success) {
                                    this.log(`Use ${params.ownerEnergy} energy to tap`, 'success');
                                } else {
                                    this.log(`Cannot use energy: ${useEnergyResult.error}`, 'error');
                                }
                            } else {
                                this.log('No power to tap', 'warning');
                            }
                        } else {
                            this.log(`Unable to get account parameters: ${basicParams.error}`, 'error');
                        }
                    } else {
                        this.log(`Can't get game token: ${gameTokenResult.error}`, 'error');
                    }
                } else {
                    this.log(`Login failed: ${loginResult.error}`, 'error');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await this.countdown(3 * 60);
        }
    }
}

const client = new SosoAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});