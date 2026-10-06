/** The same regional sign style is used beside the road and in the HUD. Limits remain km/h. */
export type SpeedSignStyle = 'circle' | 'speed' | 'maximum';
export function roadSignStyle(name:string):SpeedSignStyle {
  return name==='NOVA CITY'?'speed':name==='PORT ZENITH'?'maximum':'circle';
}

/** Crisp, reusable sign faces; no photograph background or baked-in speed number. */
export function drawSpeedSign(canvas:HTMLCanvasElement,limit:number,style:SpeedSignStyle) {
  canvas.width=style==='circle'?512:384;canvas.height=512;
  const c=canvas.getContext('2d')!,w=canvas.width;
  c.fillStyle='#ffffff';c.strokeStyle='#171717';c.textAlign='center';c.textBaseline='middle';
  if(style==='circle') {
    c.beginPath();c.arc(256,256,250,0,Math.PI*2);c.fill();
    c.strokeStyle=limit?'#c81020':'#333333';c.lineWidth=limit?64:8;
    c.beginPath();c.arc(256,256,limit?214:240,0,Math.PI*2);c.stroke();
    c.fillStyle='#000000';c.font=`900 ${limit?limit>=100?190:224:120}px Arial, sans-serif`;
    c.fillText(limit?String(limit):'END',256,266,360);
    return;
  }
  c.beginPath();c.roundRect(4,4,w-8,504,24);c.fill();
  c.lineWidth=6;c.stroke();c.lineWidth=9;c.beginPath();c.roundRect(16,16,w-32,480,13);c.stroke();
  c.fillStyle='#111111';
  if(style==='speed') {
    c.font='900 70px Arial, sans-serif';c.fillText('SPEED',w/2,85,w-58);c.fillText('LIMIT',w/2,170,w-58);
    c.font='900 220px Arial, sans-serif';c.fillText(String(limit),w/2,350,w-58);
  } else {
    c.font='900 49px Arial, sans-serif';c.fillText('MAXIMUM',w/2,83,w-54);
    c.font='900 235px Arial, sans-serif';c.fillText(String(limit),w/2,282,w-54);
    c.font='bold 68px Arial, sans-serif';c.fillText('km/h',w/2,437,w-64);
  }
}
