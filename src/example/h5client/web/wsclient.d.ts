declare class WsClient{
    /**
     * @param connectTimeout 连接超时时长， 毫秒
     * @param reconnInterval 断线重连时长， -1不重连， 毫秒
     */
    constructor(connectTimeout: number, reconnInterval: number);

    /**
     * 连接服务器
     * @param url websocket url ws://url:port/protocol
     */
    connect(url: string): void;

     /**断开连接 */
    close(): void;

    /**远程调用
     * @param param 调用参数
     * @param cb 调用返回回调 (err, result)=>{}
     */
    rpc(param: any, cb: (error: Error|null, msg: any)=>void): void;

    /**发送消息
     * @param msg 消息
     */
    send(msg: any, end: boolean): void;

    /**
     * 设置消息分发回调函数
     * @param packetType 消息类型或者带cmd字段的对象
     * @cb 回调函数
     */
    router(packetType: any, cb: (msg: any)=>void): void;

    /**
    * 设置事件回调或者调用
    * @param event 事件名称
    * disconnect, 断线事件
    * error, 发生错误
    * connected, 连接完成, 对应connect()
    * @param params 如果是函数则设置，否则调用
    */
    on(event: string, ...params: any[]): void;
}