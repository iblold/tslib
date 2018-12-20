// 测试用协议定义
export const intv = 200;

export const strv = "test";

/**返回值枚举定义 type: enum */
export const ECode = {
	/**操作成功 */
	Ok: 0,
	/**数据库错误 */
	DbaseFail: 1,
	/**账号已存在 */
	AccountRepeat: 2,
	/**密码错误 */
	MissPasswd: 3,
}

/**用户信息 type: struct */
export class UserInfo{
	static cmd = 'UserInfo';
	cmd: string;
	/**用户id */
	uid: number;
	/**名称 */
	name: string;
	/**头像 */
	icon: string;
	/**金币 */
	money: number;
	/**级别 */
	level: number;
	/**经验值 */
	exp: number;
	/**道具列表 */
	items: number[];
	constructor(uid: number = 0, name: string = "", icon: string = "", money: number = 0, level: number = 0, exp: number = 0, items: number[] = []){
		this.uid = uid;
		this.name = name;
		this.icon = icon;
		this.money = money;
		this.level = level;
		this.exp = exp;
		this.items = items;
		this.cmd = UserInfo.cmd

	}
}

/**聊天消息 type: protocol */
export class Chat{
	static cmd = 'Chat';
	cmd: string;
	msg: string;
	constructor(msg: string = ""){
		this.msg = msg;
		this.cmd = Chat.cmd

	}
}

/**聊天消息同步 type: protocol */
export class ChatSync{
	static cmd = 'ChatSync';
	cmd: string;
	chatMsg: string[];
	constructor(chatMsg: string[] = []){
		this.chatMsg = chatMsg;
		this.cmd = ChatSync.cmd

	}
}

/**登录消息 type: protocol */
/**登录消息request */
export class Login_req{
	static cmd = 'Login.req';
	cmd: string;
	/**账号 */
	accout: string;
	/**密码 */
	passwd: string;
	constructor(accout: string = "", passwd: string = ""){
		this.accout = accout;
		this.passwd = passwd;
		this.cmd = Login_req.cmd

	}
}
/**登录消息response */
export class Login_resp{
	static cmd = 'Login.resp';
	cmd: string;
	/**返回值 */
	code: number;
	constructor(code: number = 0){
		this.code = code;
		this.cmd = Login_resp.cmd

	}
}

/**注册消息 type: protocol */
/**注册消息request */
export class register_req{
	static cmd = 'register.req';
	cmd: string;
	/**账号 */
	accout: string;
	/**密码 */
	passwd: string;
	constructor(accout: string = "", passwd: string = ""){
		this.accout = accout;
		this.passwd = passwd;
		this.cmd = register_req.cmd

	}
}
/**注册消息response */
export class register_resp{
	static cmd = 'register.resp';
	cmd: string;
	/**返回值, ECode */
	code: number;
	constructor(code: number = 0){
		this.code = code;
		this.cmd = register_resp.cmd

	}
}

/**下发用户信息 type: protocol */
export class UserinfoSync{
	static cmd = 'UserinfoSync';
	cmd: string;
	user: UserInfo;
	constructor(user: UserInfo = new UserInfo()){
		this.user = user;
		this.cmd = UserinfoSync.cmd

	}
}


