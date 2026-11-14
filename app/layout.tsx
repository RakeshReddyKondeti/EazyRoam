import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Fredoka } from "next/font/google";
import "@/styles/eazyroam.css";

const display = Fredoka({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fredoka" });
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-atkinson",
  adjustFontFallback: false, // next/font has no metrics for this family yet
});

export const metadata: Metadata = {
  title: "EazyRoam",
  description:
    "Plan a whole day on public transit where every place, bus and sidewalk is wheelchair accessible.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
