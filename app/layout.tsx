import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Prancheta 11 — Futebol Tático por Turnos',
  description:
    'Jogo de futebol de técnico por turnos em grade 3×5 com cálculo tático de passes, cobertura defensiva e finalizações, em HTML, CSS e JavaScript puros.',
  openGraph: {
    title: 'Prancheta 11 — Futebol Tático por Turnos',
    description:
      'Jogo de futebol de técnico por turnos em grade 3×5 com cálculo tático de passes, cobertura defensiva e finalizações.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prancheta 11 — Futebol Tático por Turnos',
    description:
      'Jogo de futebol de técnico por turnos em grade 3×5 com cálculo tático de passes, cobertura defensiva e finalizações.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
