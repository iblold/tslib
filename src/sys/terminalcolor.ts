/******************************************************
 * @Description: 
 * @Date: 2018-12-16 00:38:18
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 12:46:28
 *******************************************************/

/**控制台颜色定义 */
export class TerminalColor{
    static ESC = "";
    static CSI = "[";
     
                    /*  Foreground Colors  */
     
    static BLK = "[30m";          /* Black    */
    static RED = "[31m";          /* Red      */
    static GRN = "[32m";          /* Green    */
    static YEL = "[33m";          /* Yellow   */
    static BLU = "[34m";          /* Blue     */
    static MAG = "[35m";          /* Magenta  */
    static CYN = "[36m";          /* Cyan     */
    static WHT = "[37m";          /* White    */
     
                    /*   Hi Intensity Foreground Colors   */
     
    static HIR = "[1;31m";        /* Red      */
    static HIG = "[1;32m";        /* Green    */
    static HIY = "[1;33m";        /* Yellow   */
    static HIB = "[1;34m";        /* Blue     */
    static HIM = "[1;35m";        /* Magenta  */
    static HIC = "[1;36m";        /* Cyan     */
    static HIW = "[1;37m";        /* White    */
    
                    /* High Intensity Background Colors  */
    
    static HBRED = "[41;1m";       /* Red      */
    static HBGRN = "[42;1m";       /* Green    */
    static HBYEL = "[43;1m";       /* Yellow   */
    static HBBLU = "[44;1m";       /* Blue     */
    static HBMAG = "[45;1m";       /* Magenta  */
    static HBCYN = "[46;1m";       /* Cyan     */
    static HBWHT = "[47;1m";       /* White    */
     
                    /*  Background Colors  */
     
    static BBLK = "[40m";          /* Black    */
    static BRED = "[41m";          /* Red      */
    static BGRN = "[42m";          /* Green    */
    static BYEL = "[43m";          /* Yellow   */
    static BBLU = "[44m";          /* Blue     */
    static BMAG = "[45m";          /* Magenta  */
    static BCYN = "[46m";          /* Cyan     */
    static BWHT = "[47m";          /* White    */
    
    static NOR = "[2;37;0m";      /* Puts everything back to normal */
     
    /*  Additional ansi Esc codes added to ansi.h by Gothic  april 23,1993 */
    /* Note, these are Esc codes for VT100 terminals, and emmulators */
    /*       and they may not all work within the mud               */
     
    static BOLD	 = "[1m";     /* Turn on bold mode */
    static CLR		 = "[2J";     /* Clear the screen  */
    static HOME	 = "[H";      /* Send cursor to home position */
    static REF		 = "[2J[H";      /* Clear screen and home cursor */
    static BIGTOP	 = "#3";      /* Dbl height characters, top half */
    static BIGBOT	 = "#4";      /* Dbl height characters, bottem half */
    static SAVEC	 = "[s";      /* Save cursor position */
    static REST	 = "[u";      /* Restore cursor to saved position */
    static REVINDEX = "M";       /* Scroll screen in opposite direction */
    static SINGW	 = "#5";      /* Normal, single-width characters */
    static DBL		 = "#6";      /* Creates double-width characters */
    static FRTOP	 = "[2;25r";  /* Freeze top line */
    static FRBOT	 = "[1;24r";  /* Freeze bottom line */
    static UNFR	 = "[r";      /* Unfreeze top and bottom lines */
    static BLINK	 = "[5m";     /* Initialize blink mode */
    static U		 = "[4m";     /* Initialize underscore mode */
    static REV		 = "[7m";     /* Turns reverse video mode on */
    static HIREV	 = "[1,7m";   /* Hi intensity reverse video  */

    /**
     * 给字符串加上控制台颜色红色
     * @param str 字符串
     */
    static red(str: string){
        return TerminalColor.HIR + str + TerminalColor.NOR;
    }
    
    static orange(str: string){
        return TerminalColor.YEL + str + TerminalColor.NOR;
    }
    
    static yellow(str: string){
        return TerminalColor.HIY + str + TerminalColor.NOR;
    }
    
    static green(str: string){
        return TerminalColor.HIG + str + TerminalColor.NOR;
    }
    
    static cyan(str: string){
        return TerminalColor.HIC + str + TerminalColor.NOR;
    }
    
    static blue(str: string){
        return TerminalColor.HIB + str + TerminalColor.NOR;
    }
    
    static purple(str: string){
        return TerminalColor.HIM + str + TerminalColor.NOR;
    }
    
    static black(str: string){
        return TerminalColor.BLK + str + TerminalColor.NOR;
    }
    
    static white(str: string){
        return TerminalColor.HIW + str + TerminalColor.NOR;
    }
}
