
 /** 在线状态 */
 export class LineState{
    /**未知状态 */
    static None = 0;
    /**连接中 */
    static Connecting= 1;
    /**离线 */
    static OnLine = 2;
    /**在线 */
    static OffLine = 3;
}

const WebSocket:any = (<any>window).WebSocket || (<any>window).MozWebSocket;

type CbMap =  {[key: string]: (msg:any)=>any};

class WsClient{
    m_ws: any;
    m_url: string;
    m_rpcid: number;
    //m_sendQueue = [];
    m_lostBreathTimes = 0;
    m_breathTimer = null;
    m_lineState = LineState.None;
    /**rpc调用队列 */
    m_rpcQueue: CbMap;
    /**消息分发函数列表 */
    m_router: CbMap;
    m_callbacks: CbMap;
    m_connectTimeout = 0; 
    m_reconnInterval = -1;

    constructor(connectTimeout: number, reconnInterval: number){
        this.m_ws = null;
        this.m_url = '';
        this.m_rpcid = 0;
        this.m_rpcQueue = {};
       // this.m_sendQueue = [];
        this.m_lostBreathTimes = 0;
        this.m_breathTimer = null;
        this.m_lineState = LineState.None;
        this.m_router = {};
        this.m_callbacks = {};
        this.m_connectTimeout = connectTimeout || 5000;
        this.m_reconnInterval = reconnInterval || -1;
    }

    connect(url: string, cb: ()=>void){

    }

    reConnect(){

    }

    close(){

    }

    onError(){

    }

    onData(msg: any){

    }

    onEnd(){

    }

    breath(){

    }

    rpc(params: any, cb: (msg: any)=>void){

    }

    send(msg: any, end: boolean){

    }

    roter(packetType: any, cb: (msg: any)=>void){

    }

    on(event: string, ...params: any){

    }
}