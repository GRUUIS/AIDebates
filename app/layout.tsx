import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ethics Arena",
  description: "A multi-agent AI debate chatroom for moral and ethical dilemmas."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
