import { BaseFn } from '../../sys/basefunc';
import {WsServer, Client, Server, TcpServer} from '../../sys/network';
import * as P from '../protocol';
import {Log} from '../../sys/log';

/** 聊天服务器例子 */

/**用户id */
let id = 1;
/**临时连接队列 */
let tempClients: any[] = [];
/**用户列表 */
let users: {[key: number]: Client} = {};

/**定义消息响应函数 */
function defFunctions(server: Server){
    // 处理登录消息
    server.defRpc(P.Login_req, (client: Client, info: P.Login_req)=>{
        logInfo(client.m_remoteAddr + ' login ok!' + info.accout + ':' + info.passwd);

        // 通知其他用户有人进入
        for(let k in users){
            let c = users[k];
            c.sendMsg(new P.ChatSync([id + ' join']));
        }

        // 用户存进用户表
        users[id] = client;

        // 给连接添加标识
        client.m_userData = id;

        // 给客户端发送用户信息
        client.sendMsg(new P.UserinfoSync(new P.UserInfo(id, 'test', '1.png', 1,1,1,[1,2,3,4,5])));
        id++;

        // 返回登录结果
        return new P.Login_resp(P.ECode.Ok);
    })

    // 处理注册消息
    .defRpc(P.register_req, (client: Client, reg: P.register_req)=>{
        // 返回注册成功, 这里只是用来测试消息来回
        return new P.register_resp(P.ECode.Ok);
    })

    // 处理聊天消息
    .defRpc(P.Chat, (client: Client, chat: P.Chat)=>{
        if (client.m_userData){
            // 直接把聊天内容同步给每个用户
            for(let k in users){
                let c = users[k];
                c.sendMsg(new P.ChatSync([client.m_userData + ': ' + chat.msg]));
            }
        }

    })
}

function main(){
    // 创建日志快速访问接口
    Log.createSingleton();

    // 创建websocket服务器
    let server = new TcpServer();//WsServer('games');
    
    // 注册服务器系统事件响应函数
    server.on('error', (client: Client, err: Error)=>{
        logErr(err.message);
    })
    .on('newconn',  (client: Client)=>{
        tempClients.push(client);
        logWran('new connect: ' + client.m_remoteAddr);
    })
    .on('disconnect', (client: Client)=>{
        logWran('disconnect: ' + client.m_remoteAddr);
        if (client.m_userData){
            delete users[client.m_userData];
            for(let k in users){
                let c = users[k];
                c.sendMsg(new P.ChatSync(['user: ' + client.m_userData + ' leave']));
            }
        } else {
            tempClients.splice(tempClients.indexOf(client), 1);
        }
    })
    .on('start', (port: number)=>{
        logInfo('server start success! ::' + port);
    });

    defFunctions(server);

    // 处理无效连接
    setInterval(()=>{
        for(let i = 0; i < tempClients.length; i++){
            let c: Client = tempClients[i];

            if (c.m_lastRecvTime == 0){
                // 连接60秒收不到消息报直接踢掉
                if (BaseFn.getTimeMS() - c.m_connectedTime > BaseFn._second(60)){
                    c.close();
                    tempClients.splice(tempClients.indexOf(c), 1);
                }
            } else {
                // 正常连接, 移出临时队列
                tempClients.splice(tempClients.indexOf(c), 1);
            }
        }
    }, BaseFn._second(1));

    // 启动服务器
    server.start(10086);

    let wss = new WsServer('games');
    server.hold(wss);
    wss.start(10010);

}

main();
