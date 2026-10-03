import Image from "next/image";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-sidebar flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Image
            src="/logo-pereda.png"
            alt="Platería Pereda"
            width={110}
            height={119}
            priority
          />
        </div>
        {children}
      </div>
    </main>
  );
}
