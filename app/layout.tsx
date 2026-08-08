import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol ?? (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = host
    ? new URL(protocol + "://" + host)
    : new URL("http://localhost:3000");
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: {
      default: "THEUS — Seu mundo, no lugar.",
      template: "%s · THEUS",
    },
    description:
      "Tarefas, notas e agenda em um espaço pessoal, seguro e feito para a vida real.",
    openGraph: {
      type: "website",
      locale: "pt_BR",
      title: "THEUS — Seu mundo, no lugar.",
      description:
        "Tarefas, notas e agenda em um espaço pessoal, seguro e feito para a vida real.",
      images: [{ url: socialImage, alt: "THEUS — Seu mundo, no lugar." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "THEUS — Seu mundo, no lugar.",
      description:
        "Tarefas, notas e agenda em um espaço pessoal, seguro e feito para a vida real.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
