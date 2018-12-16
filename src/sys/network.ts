/******************************************************
 * @Description: 
 * @Date: 2018-12-14 21:05:40
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-17 00:12:52
 *******************************************************/
 import * as tcpnet from 'net';
 import * as udpnet from 'dgram';
 import * as http from 'http';
 import * as websocket from 'websocket';
 import * as zlib from 'zlib';
 import { BaseFn } from './basefunc';

 export const MaxPacketSize = 128 * 1024;

 /** 网络连接类型 */
 export class NetType{
     static None = 0;
     static Tcp = 1;
     static Udp = 2;
     static WebSocket = 3;
 }

 /** NetBase类 */
 class NetBase{
     m_type: NetType;
     private m_callbacks: Map<string, any>; 

     constructor(type: NetType){
         this.m_type = type;
         this.m_callbacks = new Map<string, any>();
     } 

     on(name: string, ...params: any){
        if (params.length == 1 && typeof params[0] == 'function'){
            this.m_callbacks.set(name, params[0]);
            return this;
        } else {
            let cb = this.m_callbacks.get(name);
            if (cb){
                return cb.apply(null, params);
            }
        }
        return null;
     }
 } 

 /** 服务器基类 */
 export abstract class Server extends NetBase{
     /** 客户端列表 */
     m_clients: Client[];
     m_roter: any;

     /**
      * 构造函数
      * @param type 网络类型
      */
     constructor(type: NetType){
         super(type);
         this.m_type = type;
         this.m_clients = [];
         this.m_roter = {};
     }

     /**
      * 定义消息分发函数
      * @param msg 消息对象或者消息类型 
      * @param cb 消息接收函数
      */
     defRpc(msg: any, cb: (conn: Client, params: any)=>void){
        if (typeof msg == 'string'){
            this.m_roter[msg] = cb;
        } else {
            this.m_roter[msg.cmd] = cb;
        }
     }

     /**
      * 处理接收到的消息
      * @param msg 接收到的消息
      */
     dispatcher(conn: Client, msg: any){
        let cb = this.m_roter[msg.cmd||''];
        if(cb) cb(conn, msg);
     }

     abstract incomming(socket: any): void;
     
     disconnect(client: any){
        this.m_clients.splice(this.m_clients.indexOf(client), 1);
     }
 }

 export class LineState{
     static None = 0;
     static OnLine = 1;
     static OffLine = 2;
 }

 export abstract class Client extends NetBase{
     m_server: Server|null;
     m_lineState: LineState;
     m_connectedTime: number;
     m_sendQueue: any;
     m_rpcQueue: any;
     m_roter: any;
     m_lastRecvTime: number;
     m_remoteAddr: string;

     constructor(type: NetType, server: Server|null = null){
        super(type);
        this.m_server = server;
        this.m_lineState = LineState.None;
        this.m_connectedTime = 0;
        this.m_sendQueue = {};
        this.m_rpcQueue = {};
        this.m_roter = {};
        this.m_lastRecvTime = 0;
        this.m_remoteAddr = '';
     }

     private makeMsgBuff(msg: object|string, cb: (buffer: Buffer|null)=>void, ziped: boolean) {
         if (typeof msg == 'object') {
             msg = JSON.stringify(msg);
         }
     
         let strBuf = Buffer.from(msg);
     
         // buff struct
         // flag 0x1234 | size 4 | uncomp size 4 |data | 
         if (strBuf.length > 128 && ziped == true) {
             let level;
             if (strBuf.length < 512) {
                 level = 1;
             } else if (strBuf.length < 4096) {
                 level = 3;
             } else {
                 level = 5;
             }
     
             // 大于512字节的消息压缩传输
             zlib.deflate(strBuf, { level: level }, (err, comp) => {
                 if (err){
                    cb(null);
                 } else {
                    let size = 10 + comp.length;
                    let buff = Buffer.alloc(size);
                    buff.writeUInt16LE(0x1234, 0);
                    buff.writeUInt32LE(size, 2);
                    buff.writeUInt32LE(strBuf.length, 6);
                    comp.copy(buff, 10, 0);
        
                    cb(buff);
                 }
             });
         } else {
             let size = 10 + strBuf.length;
             if (MaxPacketSize < size) {
                 logErr('net packet size error, size: ' + size);
             }
     
             let buff = Buffer.alloc(size);
             buff.writeUInt16LE(0x1234, 0);
             buff.writeUInt32LE(size, 2);
             buff.writeUInt32LE(0, 6);
             strBuf.copy(buff, 10, 0);
     
             cb(buff);
         }
     }

     checkMsg(buffer: Buffer){
        return buffer.readUInt16LE(0) == 0x1234;
     }
     
     abstract connectTo(host: string, port: number, cb: ()=>void): void;
     abstract onData(buffer: any): void;
     abstract send(buffer: Buffer, end: boolean): void;
     abstract close(): void;

     onError(err: Error|null){
        this.on('error', err);
     }

     onConnected(){
        this.on('connected');
        this.m_lineState = LineState.OnLine;
     }
    
     onEnd(){
        this.on('dissconnect');
        if (this.m_server)
           this.m_server.disconnect(this);
        this.m_lineState = LineState.OffLine;
     }
    
     connect(host: string, port: number){
         if (this.m_lineState == LineState.OnLine){
            this.onError(new Error('connect_online'));
            return;
         }
            
         this.m_lineState = LineState.OffLine;
         let timer = setTimeout(() => {
            this.m_lineState = LineState.None;
            this.onError(new Error('connect_timeout'));
         }, BaseFn._second(30));

         this.connectTo(host, port, ()=>{
             clearTimeout(timer);
             if (this.m_lineState == LineState.OffLine){
                 this.m_lineState = LineState.OnLine;
                 this.m_connectedTime = BaseFn.getTimeMS();
                 this.onConnected();
             }
         });
     }

     sendMsg(obj: object|string){
         if (this.m_lineState != LineState.OnLine){
            logErr('tcpclient offline!');
            return;
         }
            
         let packet: any = {};
         let sid = BaseFn.globalID();
         this.m_sendQueue[sid] = packet;
         this.makeMsgBuff(obj, (buff: Buffer|null)=>{
             if (buff){
                packet.state = 1;
                packet.buffer = buff;
             } else {
                 delete this.m_sendQueue[sid];
             }

             for(let key in this.m_sendQueue){
                 let v: any = this.m_sendQueue[key];
                 if (v.state == 1){
                    this.send(v.buffer, false);
                    delete this.m_sendQueue[key];
                 } else {
                    break;   
                 }
             }
         }, true);
     }

     sendAndClose(obj: Object){
        if (this.m_lineState != LineState.OnLine){
            logErr('tcpclient offline!');
            return;
         }

         this.makeMsgBuff(obj, (buff: Buffer|null)=>{
            if(buff) this.send(buff, true);
         }, true);
     }

     rpc(obj: any, cb: (result: any)=>void){
        if (this.m_lineState != LineState.OnLine){
            logErr('tcpclient offline!');
            return;
        }

        let sid = BaseFn.globalID();
        obj.rpcid = sid;

        let timer: any = setTimeout(()=>{
            clearTimeout(timer);
            timer = -1;
            delete this.m_rpcQueue[sid];
            logErr('rpc timeout! msg=' + JSON.stringify(obj));
        }, BaseFn._second(10));

        this.m_rpcQueue[sid] = (result: any)=>{
            if (timer != -1){
                clearTimeout(timer);
                cb(result);
                delete this.m_rpcQueue[sid];
            }
        };

        this.sendMsg(obj);
     }

     defMsg(packetType: any, cb: (result: any)=>void){
        if (typeof packetType == 'string'){
            this.m_roter[packetType] = cb;
        } else if (packetType.cmd){
            this.m_roter[packetType.cmd] = cb;
        }
        return this;
     }

     
     dispatcher(buffer: any){
         let str = '';
         if (typeof buffer != 'string'){
            str = buffer.toString('utf8');
         } else {
            str = buffer;
         }

        let jsonmsg = JSON.parse(str);
        let rpcid = jsonmsg.rpcid;

        // 如果是rpc调用结果
        if (rpcid && this.m_rpcQueue[rpcid]) {
            this.m_rpcQueue[rpcid](jsonmsg);
            return;
        }

        // 消息分发
        if (this.m_server) {
            this.m_server.dispatcher(jsonmsg, this);
        } else {
            if (jsonmsg.cmd && this.m_roter[jsonmsg.cmd]){
                this.m_roter[jsonmsg.cmd](jsonmsg);
            }
        }
     }
 }

 export class TcpServer extends Server{
     m_server: tcpnet.Server | null;

     constructor(){
         super(NetType.Tcp);
         this.m_server = null;
         this.on('error', (err: Error)=>{
            logErr('TcpServer Error:' + (err ? err.message : 'unknow'));
         });
     }

     start(port: Number){
         this.m_server = tcpnet.createServer((socket: tcpnet.Socket)=>{
             let accept = this.on('incomming', socket);
             return accept == null ? true : accept;
         });

         this.m_server.on('error', err=>{
             this.on('error', err);
         });

         this.m_server.listen(port, undefined, ()=>{
            this.on('start');
         });
     }

     incomming(socket: tcpnet.Socket){
        let accept = this.on('incomming', socket);
        if (accept == true || accept == null){
            let conn = new TcpClient(socket);
            this.m_clients.push(conn);
            this.on('newconn', conn);
            return true;
        }
        return false;
     }
 }

 export class TcpClient extends Client{
     m_socket: tcpnet.Socket|null;
     m_recvBuffer: Buffer;
     m_recvUsed: number;
     constructor(socket: tcpnet.Socket|null = null, server: TcpServer|null = null){
         super(NetType.Tcp, server);
         this.m_socket = socket;
         this.m_recvBuffer = Buffer.alloc(MaxPacketSize);
         this.m_recvUsed = 0;
         if (socket){
            this.m_connectedTime = BaseFn.getTimeMS();
            this.m_lineState = LineState.OnLine;
            this.m_remoteAddr = socket.remoteAddress + ':' + socket.remotePort;
        }
     }
     
     connectTo(host: string, port: number, cb: ()=>void){
        this.m_socket = tcpnet.connect(port, host, ()=>{
            cb();
            this.m_remoteAddr = host + ':' + port;
        });
        
        this.m_socket.on('error', this.onError.bind(this))
        .on('data', this.onData.bind(this))
        .on('end', this.onEnd.bind(this))
     }

     send(buffer: Buffer, end: boolean){
         if (this.m_socket){
             end ? this.m_socket.end(buffer) : this.m_socket.write(buffer);
         }
     }

     close(){
         if (this.m_socket)
            this.m_socket.end();
     }
 
     onData(buffer: Buffer){
        this.m_lastRecvTime = BaseFn.getTimeMS();

        // 数据写入接收缓冲
        buffer.copy(this.m_recvBuffer, this.m_recvUsed);
        this.m_recvUsed += buffer.length;

        // 收到错误消息包，断开此链接
        if (!this.checkMsg(this.m_recvBuffer)) {
            logErr("recive error packet from " + this.m_remoteAddr);
            this.close();
        } else {

            // 当前包大小
            let cursize = this.m_recvBuffer.readUInt32LE(2);
            // 收到半包，继续等待
            if (cursize > this.m_recvUsed) return;

            let offset = 0;
            while (offset < this.m_recvUsed) {
                // 取出一个完整包
                let msg = this.m_recvBuffer.slice(offset, offset + cursize);
                let unzSize = msg.readUInt32LE(6);
                if (unzSize > 0) {
                    zlib.inflate(msg.slice(10), (err, buff) => {
                        if (!err) {
                            this.dispatcher(buff);
                        } else {
                            logErr('recv zip packet error: ' + err);
                            this.on('error', err);
                        }
                    });
                } else {
                    this.dispatcher(msg.slice(10));
                }

                offset += cursize;
                if (offset >= this.m_recvUsed) {
                    this.m_recvUsed = 0;
                    return;
                } else {
                    // 不够读出下一个包体大小
                    if (offset + 6 > this.m_recvUsed) {
                        let size = this.m_recvUsed - offset;
                        BaseFn.moveBufferSelf(this.m_recvBuffer, { begin: offset, end: this.m_recvUsed }, { begin: 0, end: size });
                        this.m_recvUsed = size;
                    } else {
                        cursize = this.m_recvBuffer.readUInt32LE(offset + 2);

                        // 只剩下半包可读
                        if (offset + cursize > this.m_recvUsed) {
                            let size = this.m_recvUsed - offset;
                            BaseFn.moveBufferSelf(this.m_recvBuffer, { begin: offset, end: this.m_recvUsed }, { begin: 0, end: size });
                            this.m_recvUsed = size;
                            return;
                        }

                    }
                }
            }
        }
     }

 }

 /*export class UdpServer extends Server{

 }

 export class UdpClient extends Client{

 }*/

 export class WsServer extends Server {
     m_httpServer: http.Server|null;
     m_wsServer: websocket.server|null;
     m_protocol: string;
     
     constructor(protocol: string){
         super(NetType.WebSocket);
         this.m_httpServer = null;
         this.m_wsServer = null;
         this.m_protocol = protocol;
     }

    start(port: number){
        this.m_httpServer = http.createServer();

        this.m_httpServer.on("error", err => {
            this.on('error', err);
        });

        //在指定的端口监听服务
        this.m_httpServer.listen(port, () => {
            this.on('start');
        });

        try {
            // websocket server
            this.m_wsServer = new websocket.server({
                'httpServer': this.m_httpServer,
                autoAcceptConnections: false
            });
        } catch (err) {
            this.on('error', err);
            return;
        }

        // 连接请求
        this.m_wsServer.on('request', this.incomming.bind(this));
    }
    
    incomming(request: websocket.request){

        if (request.requestedProtocols.indexOf(this.m_protocol) === -1) {
            request.reject();
            logWran('client reject. ws protocol wrong. want ' + this.m_protocol
                + ' get ' + request.requestedProtocols);
            return;
        }

        let accept = this.on('incomming', request);
        if (accept == true || accept == null){
            let socket = request.accept(this.m_protocol, request.origin);
            let client = new WsClient(socket, this);
            this.m_clients.push(client);
            this.on('newconn', client);
            return true;
        }

        request.reject();
        return false;
    }
 }

 export class WsClient extends Client {
     m_socket: websocket.connection|null;
     m_url: string;
    constructor(socket: websocket.connection|null = null, server: Server|null = null){
        super(NetType.WebSocket, server);
        this.m_socket = socket;
        this.m_url = '';
    }

    connectTo(host: string, port: number|null, cb: ()=>void){

        let tmp = host.match(/(ws:\/\/[\w\.:]+)\/*([\w\-\.]*)/);
        if (!tmp || tmp.length != 3) {
            logErr('websocket connect failed. url error: ' + host);
            return;
        }

        let client = new websocket.client();

        client.on('connect', connection=>{
            this.m_socket = connection;
            this.m_remoteAddr = host;

            connection.on('error', this.onError.bind(this))
            .on('close', this.onEnd.bind(this))
            .on('message', this.onData.bind(this));

            cb();
        })
        .on('connectFailed',  err=>{
             this.onError(err);
        });

        client.connect(tmp[1], tmp[2]);
    }

    send(buffer: Buffer, end: boolean){
        if (this.m_socket){
            if (end == true){
                 this.m_socket.sendBytes(buffer);
                 this.m_socket.close();
            } else {
                 this.m_socket.sendBytes(buffer);
            }
        }
    }

    close(){
        if (this.m_socket)
           this.m_socket.close();
    }
    
    onData(msg: websocket.IMessage){
        this.m_lastRecvTime = BaseFn.getTimeMS();
        if (msg.type === 'binary') {
            let buff = msg.binaryData;
            if (buff){
                let flag = buff.readUInt16LE(0);
                let size = buff.readUInt32LE(2);
                let unzSize = buff.readUInt32LE(6);
    
                if (unzSize > 0) {
                    zlib.inflate(buff.slice(10), (err, buff) => {
                        if (!err) {
                            this.dispatcher(buff);
                        } else {
                            logErr('recv zip packet error: ' + err);
                            this.on('error', err);
                        }
                    });
                } else {
                    this.dispatcher(buff.slice(10));
                }
            }
        } else if (msg.type == 'utf8' && msg.utf8Data){
            this.dispatcher(msg.utf8Data);
        }
    }
    
 }
