/******************************************************
 * @Description: 
 * @Date: 2018-12-16 11:58:51
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 16:21:29
 *******************************************************/

 /** 状态机 */
 export class StateSwitch{
     /** 回调函数数组 */
     m_statesCb: Array<cbFunc>;
     /** 状态名数组 */
     m_statesKey: Array<string>;
     /** 当前状态 */
     m_curState: number;
     /** 状态是否有序 */
     m_isOrder: boolean;

     constructor(){
         this.m_statesCb = new Array<cbFunc>();
         this.m_statesKey = new Array<string>();
         this.m_isOrder = true;
         this.m_curState = 0;
     }

     /**
      * 定义状态
      * @param state 状态名, 可为空
      * @param cb 回调函数
      */
     def(state: string, cb: cbFunc): void;

     /**
      * 定义一个匿名状态, 无法goto
      * @param cb 回调函数
      */
     def(cb: cbFunc): void;
     def(){
         let cb = null;
         let state = null;
         if (typeof arguments[0] == 'function'){
            cb = arguments[0];
         } else if (typeof arguments[0] == 'string'){
            state = arguments[0];
            cb = arguments[1];
         }

         if (cb){
            if (!state || typeof state != 'string' || state == ''){
                state = '__d' + this.m_statesCb.length;
            }
            this.m_statesCb.push(cb);
            this.m_statesKey.push(state);
            return this;
         }

         logErr('SwitchState def() can not accept null cb!');
         return null;
     }

     /**
      * 切换到某个状态
      * @param idx 状态id
      * @param delay 延时时间, 毫秒
      */
     goto(idx: number, delay: number): void;

     /**
      * 
      * @param state 状态名
      * @param delay 延时时间, 毫秒
      */
     goto(state: string, delay: number): void;
     goto(){
         let key = arguments[0];
         if (key){
             if(isNaN(key)){
                key = this.m_statesKey.indexOf(key);
             }
             let delay = Number(arguments[1]) || 0;
             if(key >= 0){
                 let cb = this.m_statesCb[key];
                 if(delay > 0){
                    setTimeout(cb, Math.ceil(delay * 1000));
                } else {
                    cb();
                }
             }
         }
     }

     /**
      * 切换到第一个状态
      * @param delay 延时毫秒
      */
     first(delay: number = 0){
        this.goto(0, delay);
     }

     /**
      * 下一个状态
      * @param delay 延时毫秒
      */
     next(delay: number = 0){
         if (this.m_isOrder){
             let c = this.m_curState + 1;
             if (c < this.m_statesKey.length){
                 this.m_curState = c;
                 this.goto(c, delay);
             }
         }

     }

     /**
      * 回到上一个状态
      * @param delay 延时毫秒
      */
     prev(delay: number = 0){
         if (this.m_isOrder){
            let c = this.m_curState - 1;
            if (c >= 0){
                this.m_curState = c;
                this.goto(c, delay);
            }
         }
     }

     /**
      * 重复当前状态
      * @param delay 延时毫秒
      */
     redo(delay: number = 0){
         this.goto(this.m_curState, delay);
     }

     /** 设置状态机有序,可以用next prev */
     inOrder(){
         this.m_isOrder = true;
     }

     /** 设置状态机无序 */
     unOrder(){
         this.m_isOrder = false;
     }

     /** 清空状态机 */
     clean(){
        this.m_statesCb = [];
        this.m_statesKey = [];
        this.m_curState = 0;
     }
 }
