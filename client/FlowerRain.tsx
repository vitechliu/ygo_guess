export function FlowerRain({effectId}:{effectId:string}) {
  return <div className="flower-rain" aria-hidden="true" key={effectId}>
    {Array.from({length:24},(_,index)=><span key={index} style={{
      left:`${(index*47)%101}%`,
      animationDelay:`${(index*0.35).toFixed(2)}s`,
      animationDuration:`${8+index%6}s`,
      opacity:0.5+(index%4)*0.12,
    }}/>) }
  </div>;
}
