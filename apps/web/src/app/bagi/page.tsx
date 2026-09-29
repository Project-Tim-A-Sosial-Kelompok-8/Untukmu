"use client";
import { useEffect, useRef } from "react";
export default function SharePage() {
  const frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{if(frame.current) frame.current.src="/engine/index.html?screen=shared"+location.hash;},[]);
  return <iframe ref={frame} title="Pesan Untukmu" style={{position:"fixed",inset:0,width:"100%",height:"100%",border:0}}/>;
}
