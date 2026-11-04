import Image from "next/image";

import { AuthBackdrop } from "@/components/auth/auth-backdrop";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: fondo animado. En móvil ocupa toda la pantalla, detrás del formulario. */}
      <section
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden lg:relative"
      >
        <AuthBackdrop />
        <div className="relative z-10 hidden h-full flex-col justify-between p-12 text-white lg:flex">
          <Image
            src="/logo-pereda.png"
            alt=""
            width={96}
            height={104}
            priority
            className="auth-logo-light"
          />
          <div className="max-w-md space-y-5">
            <div className="h-px w-16 bg-gradient-to-r from-white/70 to-transparent" />
            <p className="text-3xl leading-tight font-light tracking-tight text-balance xl:text-4xl">
              Restauraciones y cotizaciones con el cuidado de siempre.
            </p>
            <p className="text-sm text-white/70">
              Sistema interno de Platería Pereda
            </p>
          </div>
          <p className="text-xs tracking-[0.25em] text-white/50 uppercase">
            Platería · Joyería
          </p>
        </div>
      </section>

      <div className="lg:bg-background relative z-10 flex items-center justify-center p-4 sm:p-8">
        <div className="auth-enter bg-background/95 w-full max-w-sm rounded-2xl p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-8 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 lg:backdrop-blur-none">
          <div className="mb-8 flex justify-center lg:hidden">
            <Image
              src="/logo-pereda.png"
              alt="Platería Pereda"
              width={88}
              height={95}
              priority
            />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
