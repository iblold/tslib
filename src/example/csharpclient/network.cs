/*****************************************************************************
	文件名：		basefunction.cs
	创建时间：	2018/12/03 14：28
	创建人： 	    ycw
	文件描述：	tcp客户端类
	
******************************************************************************/

using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Text;
using System.Net.Sockets;
using System.Net;
using System.Threading;
using Newtonsoft.Json;

namespace tools
{ 
    // 网络消息接收函数类型
    public delegate void OnDataFunc(NetClient client, dynamic msg);

    //
    public delegate void OnRpcFunc(dynamic msg);

    // 短线处理函数类型
    public delegate void OnCloseFunc();

    // tcp客户端类
    public class NetClient
    {

        // 消息接收线程
        static Thread recvThread;
        // 连接列表
        static ConcurrentBag<NetClient> clients;
        // 公用接收缓存
        static byte[] commonBuffer;

        // 消息包头标志
        const int packetFlag = 0x1234;

        // 消息包头大小
        const int packetHeadLen = 10;

        // 分发缓存
        static List<dynamic> dispatchBuff;

        // 分发地址
        static Dictionary<string, OnDataFunc> dispatchFuncs;

        // 接收消息线程
        static void recvProc(object arg)
        {
            while (true)
            {
                    for (int i = 0; i < clients.Count; i++)
                    {
                        clients.ElementAt(i).recv() ;
                    }
                Thread.Sleep(1);
            }
        }

        // 本地消息循环
        public static void update()
        {
            for(int i = clients.Count - 1; i >= 0; i--)
            {
                NetClient client = clients.ElementAt(i);

                if (!client.m_online)
                {
                    clients.TryTake(out client);
                    if (client.m_onClose != null)
                        client.m_onClose();
                }
                else
                {
                    lock(client.m_lock)
                    {
                        dispatchBuff.AddRange(client.m_msgs);
                        client.m_msgs.Clear();
                    }
                    for(int j = 0; j < dispatchBuff.Count; j++)
                    {
                        client.dispatch(dispatchBuff[j]);
                    }
                    dispatchBuff.Clear();
                }
            }
        }

        // 定义接收函数
        public static void router(string key, OnDataFunc dataFunc)
        {
            dispatchFuncs.Add(key, dataFunc);
        }

        // 套接字
        Socket m_socket;

        // 接收缓存
        byte[] m_recvBuffer;
        // 缓存已用长度
        long m_recvBufferUsed;

        // 消息队列
        List<dynamic> m_msgs;
        // 接收消息锁
        object m_lock;

        // 断线通知函数
        OnCloseFunc m_onClose;

        // 在线状态
        bool m_online;

        // 远程调用回调队列
        Dictionary<UInt32, OnRpcFunc> m_rpcCallBack;

        // 远程调用id
        UInt32 m_rpcid;

        public NetClient(OnCloseFunc closeFunc = null)
        {
            if (recvThread == null)
            {
                clients = new ConcurrentBag<NetClient>();
                commonBuffer = new byte[512 * 1024];
                dispatchBuff = new List<dynamic>();
                dispatchFuncs = new Dictionary<string, OnDataFunc>();
                recvThread = new Thread(new ParameterizedThreadStart(recvProc));
                recvThread.IsBackground = true;
                recvThread.Start();
            }

            m_recvBuffer = new byte[128 * 1024];
            m_recvBufferUsed = 0;
            m_msgs = new List<dynamic>();
            m_rpcCallBack = new Dictionary<uint, OnRpcFunc>();
            m_onClose = closeFunc;
            m_online = false;
            m_rpcid = 0;
            m_lock = new object();
        }

        public bool connect(string host, int port)
        {
            IPAddress ip = IPAddress.Parse(host);
            m_socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            try
            {
                m_socket.Connect(new IPEndPoint(ip, port));
                clients.Add(this);
                m_online = true;

                return true;
            }
            catch
            {
                return false;
            }
        }

        public void close()
        {
            m_socket.Disconnect(false);
            m_socket.Close();
        }

        public void rpc(dynamic param, OnRpcFunc dataFunc)
        {
            string jsonMsg = JsonConvert.SerializeObject(param);
            int n = jsonMsg.LastIndexOf("}");
            jsonMsg = jsonMsg.Insert(n, ",\"rpcid\":" + m_rpcid);

            m_rpcCallBack.Add(m_rpcid++, dataFunc);
            send(jsonMsg);
        }

        public void send(dynamic msg)
        {
            string jsonMsg = JsonConvert.SerializeObject(msg);
            send(jsonMsg);
        }

        public void send(string json)
        {
            int len = json.Length + packetHeadLen;
            byte[] buff = new byte[len];
            buff[0] = 0x34;
            buff[1] = 0x12;

            byte[] lenBuff = BitConverter.GetBytes((UInt32)len);
            Array.Copy(lenBuff, 0, buff, 2, 4);

            byte[] jsonBuff = Encoding.UTF8.GetBytes(json);
            Array.Copy(jsonBuff, 0, buff, 10, jsonBuff.Length);

            m_socket.Send(buff);
        }

        void recv()
        {
            long len = 0;
            try
            {
                len = m_socket.Receive(commonBuffer);
            }
            catch (SocketException e)
            {
                // 断线
                if (e.ErrorCode == 10054)
                {
                    m_online = false;
                    return;
                }
            }

            if (len > 0)
            {
                Array.Copy(commonBuffer, 0, m_recvBuffer, m_recvBufferUsed, len);
                m_recvBufferUsed += len;
                int offset = 0;
                while(offset < m_recvBufferUsed)
                {
                    int flag = BitConverter.ToUInt16(m_recvBuffer, offset);
                    if (flag == packetFlag)
                    {
                        int packetLen = BitConverter.ToInt32(m_recvBuffer, 2);
                        if (offset + packetLen <= m_recvBufferUsed)
                        {
                            // 有整包
                            string json = Encoding.UTF8.GetString(m_recvBuffer, offset + packetHeadLen, packetLen - packetHeadLen);
                            if (json.IndexOf("\"cmd\"") < 0)
                            {
                                json = json.Insert(1, "\"cmd\":\"none\",");
                            }

                            dynamic obj = null;
                            try
                            {
                                obj = JsonConvert.DeserializeObject<dynamic>(json);
                            }
                            catch { }

                            lock (m_lock)
                            {
                                if (obj != null)
                                    m_msgs.Add(obj);
                            }

                            offset += packetLen;
                        }
                        else
                        {
                            // 只剩半包了
                            m_recvBufferUsed = offset + packetLen - m_recvBufferUsed;
                            Array.Copy(m_recvBuffer, offset, commonBuffer, 0, m_recvBufferUsed);
                            Array.Copy(commonBuffer, m_recvBuffer, m_recvBufferUsed);
                            break;
                        }
                        
                    }
                    else
                    {
                        m_recvBufferUsed = 0;
                        break;
                    } // if (flag == packetFlag)
                } //  while(offset < m_recvBufferUsed)
            }   // if (len > 0)
        }   // public unsafe void recv()

        void dispatch(dynamic msg)
        {
            string fkey = msg.cmd;
            if (dispatchFuncs.ContainsKey(fkey))
            {
                dispatchFuncs[msg.cmd](msg);
            }

            uint rpcid = msg.rpcid;
            if (m_rpcCallBack.ContainsKey(rpcid))
            {
                m_rpcCallBack[rpcid](msg);
                m_rpcCallBack.Remove(rpcid);
            }
        }
    }
}



