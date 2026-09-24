/**
 * Applies the saved light/dark choice before the first paint.
 *
 * It has to run inline in <head>: reading localStorage from an effect would
 * let a light frame render first and flash. Rendering is therefore a no-op —
 * `useTheme` takes over once React is running.
 */
const SCRIPT = `(function(){try{var t=localStorage.getItem("manas-erp-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
