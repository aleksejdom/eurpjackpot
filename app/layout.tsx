import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Eurojackpot · Ziehungsarchiv",description:"Eurojackpot Gewinnzahlen und historische Ziehungen nach Datum durchsuchen."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>;}
