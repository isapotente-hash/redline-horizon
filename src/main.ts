import "./style.css";
import { Game } from "./core/Game";
// Paint the supplied logo before any procedural work; loading starts during its fade.
requestAnimationFrame(()=>setTimeout(()=>void new Game().init(),0));
