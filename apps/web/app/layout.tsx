import "./globals.css";
import { Space_Grotesk, Manrope } from "next/font/google";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata = {
  title: "TaikoProofs",
  description: "Proof coverage and latency for Taiko batches"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} bg-ink text-white`}>
        {children}
      </body>
    </html>
  );
}
