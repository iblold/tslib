/******************************************************
 * @Description: 
 * @Date: 2018-12-16 12:44:09
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 20:00:20
 *******************************************************/
 /** 事件分发器 */
 export class EventDispatcher{
    m_events: any;
    m_queue: any;
    m_cberr: string;
    m_timer: any;
    m_interval: number;

    constructor(){
		// 事件注册表
		this.m_events = {};
		// 事件队列
		this.m_queue = [];
		// 事件错误提示
        this.m_cberr = "event callback function is null!";

        // 定时器
        this.m_interval = 10;
        this.m_timer = setInterval(this.tick.bind(this), this.m_interval);        
	}

	/** 注册事件定义函数
	 * @evnetId 事件序号
	 * @cb {function} 事件处理函数， 不能为空
	 * @desc {string} 描述， 可为空
	 */
	def(eventId: string|number, cb: any, desc: string){
		// Assert(cb);
		let evt = this.m_events[eventId];
		if(!evt){
			 evt = [];
			 this.m_events[eventId] = evt;
		} 
		
        // Core.log(LogDebug, "ev:" + eventId + " cb:" + cb);
        evt.push({"callback":cb, "desc":desc}); 
        return this;
	}

	/**
	 * 反注册
	 * @eventId 事件序号
	 */
	unRegister(eventId: string|number, cb: any){
		let evt = this.m_events[eventId];
		if(evt){
			for (let i = 0; i < evt.length;) {
				let item = evt[i];
				if(item.callback == cb){
					evt.splice(evt.indexOf(item), 1);
					break;
				} else {
					++i;
				}
			}
		}
	}
	
	/**
	 * 反注册全部某种事件
	 * @eventId 事件序号
	 */
	unResisterAll(eventId: string|number){
		this.m_events[eventId] = null;
	}

	/**
	 * 是否存在这个事件
	 * @eventId 事件序号
	 * @return {boolean} 是否存在
	 */
	hasEvent(eventId: string|number){
		return this.m_events[eventId] != null;
	}

	/**
	 * 私有函数，仅供类内使用。根据事件id获得处理函数
	 * @eventId 事件序号
	 * @return {function} 事件处理句柄
	 */
	private _getEvt(eventId: string| number){
		let evt = this.m_events[eventId];
		// Assert(evt);
		return evt;
	}

	/**
	 * 下一帧触发事件
	 * @eventId 事件序号
	 * @params {...array} 回调函数参数
	 */
	pushEvent(eventId: string|number, ...params: any[]){
		this.m_queue.push({"eventId":eventId, "params":params, "timeout":1});
	}

	/**
	 * 立刻触发事件
	 * @eventId {any} 事件标识
	 * @params {...array} 回调函数参数
	 */
	pushEventImm(eventId: string|number, ...params: any[]){
		this.doEvent(eventId, params);
	}

    doEvent(eventId: string|number, ...params: any[]){
        let evt = this._getEvt(eventId);
        if (!evt)
            return;
        //Core.log(LogDebug, "evtid: " + eventId + " len: " + evt.length);
		for (let i = 0; i < evt.length; i++) {
            //Core.log(LogDebug, "evtid: " + eventId + " callback: " + evt.length);
			evt[i].callback.apply(null, params);
		}
    }
    
	/**
	 * 延时触发事件
	 * @eventId {any} 事件标识
	 * @delay {integer} 延时多久， 单位毫秒
	 * @params {...array} 回调函数参数
	 */
	pushEventDelay(eventId: string|number, delay: number, ...params: any[]){
        //cc.log("pushEventDelay: " + params.length);
		this.m_queue.push({"eventId":eventId, "params":params, "timeout":delay});
	}

	/**
	 * 每帧tick
	 * @delay {integer} 上帧耗时, 单位毫秒
	 */
	tick(delay: number|null = null){
        delay = delay || this.m_interval;
		// 遍历事件队列
		for (let i = 0; i < this.m_queue.length;) {
            
            let item = this.m_queue[i];
			// 事件回调函数
			if (item.timeout <= 0){
                //cc.log("tick:" + item.params.length + "::" + item.eventId);
				this.doEvent(item.eventId, item.params);
				this.m_queue.splice(this.m_queue.indexOf(item), 1);
			} else {
				item.timeout -= delay;
				++i;
			}
		}
    }

    /** 停止内部定时器 */
    stopTick(){
        clearInterval(this.m_timer);
    }
    
    /** 获得事件分发器单件 */
    static getInst(): EventDispatcher{
        (<any>global)._eventdispatcher_singleton = (<any>global)._eventdispatcher_singleton || new EventDispatcher();
        return (<any>global)._eventdispatcher_singleton;
    }
 }
