import {physicalMobileDevice,desktopPreview} from '../input/DevicePolicy';

export function switchDeveloperView(){
  if(!physicalMobileDevice())return;
  const url=new URL(location.href);
  if(desktopPreview())url.searchParams.delete('dev-view');
  else url.searchParams.set('dev-view','desktop');
  // Navigate instead of running a second world beside the preview.
  window.top!.location.assign(url.href);
}

/** A single game runs inside a genuine laptop-sized viewport, including CSS media queries. */
export function mountDesktopView():boolean {
  if(!physicalMobileDevice()||window.parent!==window||new URL(location.href).searchParams.get('dev-view')!=='desktop')return false;
  const url=new URL(location.href);url.searchParams.set('dev-view','desktop-frame');
  const screen=document.createElement('div');
  screen.style.cssText='position:fixed;inset:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);overflow:hidden;background:#11151b';
  const frame=document.createElement('iframe');
  frame.id='desktop-game';frame.title='Redline Horizon laptop view';frame.src=url.href;
  frame.style.cssText='position:absolute;width:1366px;height:768px;border:0;transform-origin:0 0';
  screen.append(frame);document.body.replaceChildren(screen);
  const fit=()=>{
    const {width,height}=screen.getBoundingClientRect(),scale=Math.min(width/1366,height/768);
    frame.style.transform=`scale(${scale})`;
    frame.style.left=`${(width-1366*scale)/2}px`;frame.style.top=`${(height-768*scale)/2}px`;
  };
  new ResizeObserver(fit).observe(screen);fit();
  return true;
}
