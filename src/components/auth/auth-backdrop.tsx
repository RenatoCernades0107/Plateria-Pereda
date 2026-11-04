/**
 * Fondo decorativo y animado del login: degradado vino de la marca, destellos
 * plateados que se desplazan lentamente y el símbolo de Pereda como marca de agua.
 * Solo CSS (ver `.auth-*` en globals.css); se detiene con `prefers-reduced-motion`.
 */
export function AuthBackdrop() {
  return (
    <div className="auth-backdrop absolute inset-0" aria-hidden="true">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-sheen" />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorativo, sin optimización */}
      <img src="/logo-simbolo.png" alt="" className="auth-watermark" />
      <div className="auth-grain" />
    </div>
  );
}
