import "./style.css";
import { Game } from "./core/Game";
import { mobileDevice } from "./input/DevicePolicy";
import { startMobileFullscreen } from "./input/MobileFullscreen";
import { startLoadingProgress } from "./core/Loading";
import { mountDesktopView } from "./ui/DesktopView";
startMobileFullscreen(mobileDevice());
if(!mountDesktopView()){
startLoadingProgress();
// Paint the supplied logo before any procedural work; loading starts during its fade.
requestAnimationFrame(()=>setTimeout(()=>void new Game().init(),0));
}
