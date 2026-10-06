"use client";
import { useEffect } from "react";
export function RegisterPWA() {
  useEffect(()=>{if("serviceWorker" in navigator && window.isSecureContext) void navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{/* Online mode remains available if installation is declined. */});},[]);
  return null;
}
