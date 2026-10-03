import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createId } from '../../lib/id';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosCatalogItem, BosLine, QuantityBosLine, WireBosLine } from '../../types/domain';
import { estimateTotal, lineTotal } from './calculations';
import { createWorksheetLine, duplicateLine, priceLine } from './worksheet';

export function useBosEstimate(catalog: BosCatalogData | null) {
  const [state,setState]=useState<{lines:BosLine[];focusedId:string | null;duplicateNotice:string;focusTick:number}>({lines:[],focusedId:null,duplicateNotice:'',focusTick:0});
  const {lines,focusedId,duplicateNotice}=state;
  const catalogRef=useRef(catalog);catalogRef.current=catalog;
  useEffect(()=>{if(focusedId)requestAnimationFrame(()=>document.getElementById(focusedId)?.focus());},[focusedId,state.focusTick]);
  const addLine=useCallback((item:BosCatalogItem,pendingSpecification=false)=>{
    const next={...createWorksheetLine(item,createId('bos'),catalog),specificationPending:pendingSpecification};
    setState(current=>{const existing=duplicateLine(current.lines,next);return {...current,lines:existing ? current.lines : [...current.lines,next],focusedId:existing?.id ?? next.id,focusTick:current.focusTick+1,duplicateNotice:existing ? 'This selection already exists. Increase its quantity in the worksheet.' : ''};});
    return next.id;
  },[catalog]);
  const changeSpecification=useCallback((id:string,item:BosCatalogItem)=>{
    setState(current=>{const old=current.lines.find(l=>l.id===id);if(!old)return current;const next=createWorksheetLine(item,id,catalog,old);const existing=duplicateLine(current.lines,next);return {...current,lines:existing ? current.lines : current.lines.map(l=>l.id===id ? next : l),focusedId:existing?.id ?? id,focusTick:current.focusTick+1,duplicateNotice:existing ? 'That specification already exists. Increase its quantity instead.' : ''};});
  },[catalog]);
  const update=useCallback((id:string,patch:Partial<BosLine>)=>{
    setState(current=>{const old=current.lines.find(l=>l.id===id);if(!old)return current;const next=priceLine({...old,...patch} as BosLine,catalog);const existing=duplicateLine(current.lines,next);return {...current,lines:existing ? current.lines : current.lines.map(l=>l.id===id ? next : l),focusedId:existing?.id ?? current.focusedId,focusTick:current.focusTick+(existing ? 1 : 0),duplicateNotice:existing ? 'That selection already exists. Increase its quantity instead.' : ''};});
  },[catalog]);
  const updateWireLine=useCallback((id:string,patch:Partial<WireBosLine>)=>update(id,patch),[update]);
  const updateQuantityLine=useCallback((id:string,patch:Partial<QuantityBosLine>)=>update(id,patch),[update]);
  const removeLine=useCallback((id:string)=>setState(current=>({...current,lines:current.lines.filter(l=>l.id!==id),duplicateNotice:''})),[]);
  const replaceLines=useCallback((next:BosLine[])=>setState(current=>({...current,lines:catalogRef.current ? next.map(line=>priceLine(line,catalogRef.current)) : next,duplicateNotice:''})),[]);
  useEffect(()=>{if(catalog)setState(current=>({...current,lines:current.lines.map(line=>priceLine(line,catalog))}));},[catalog]);
  const total=useMemo(()=>estimateTotal(lines),[lines]);
  const linesWithAmounts=useMemo(()=>lines.map(line=>({line,amount:lineTotal(line)})),[lines]);
  return {lines,total,linesWithAmounts,addLine,removeLine,replaceLines,updateWireLine,updateQuantityLine,changeSpecification,focusedId,duplicateNotice};
}
