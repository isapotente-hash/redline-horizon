export type DeviceInfo={userAgent:string;platform:string;maxTouchPoints:number;touchSupported:boolean;coarse:boolean;mobileHint?:boolean;platformHint?:string};
/** Touch capability and viewport width alone must never enable a desktop overlay. */
export function isMobileDevice(d:DeviceInfo):boolean {
  if(!d.touchSupported||d.maxTouchPoints<1)return false;
  const ua=d.userAgent,platform=d.platformHint||d.platform;
  if(/Windows|Win32|Win64|CrOS/i.test(ua+' '+platform))return false;
  if(/Android|iPhone|iPad|iPod/i.test(ua+' '+platform))return true;
  // iPadOS Safari can identify as a Mac. Desktop Macs do not advertise multitouch.
  if(/MacIntel/i.test(d.platform)&&/Macintosh/i.test(ua)&&d.maxTouchPoints>1&&d.coarse)return true;
  return d.mobileHint===true&&!/Mac|Linux|X11/i.test(ua+' '+platform);
}
export function mobileDevice():boolean {
  const n=navigator as Navigator&{userAgentData?:{mobile:boolean;platform:string}};
  return isMobileDevice({userAgent:n.userAgent||'',platform:n.platform||'',maxTouchPoints:n.maxTouchPoints||0,
    touchSupported:n.maxTouchPoints>0||'ontouchstart' in window,coarse:matchMedia('(pointer: coarse)').matches,
    mobileHint:n.userAgentData?.mobile,platformHint:n.userAgentData?.platform});
}
