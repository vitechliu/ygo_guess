function hash(value:string){let result=2166136261;for(const char of value){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0;}

export function RoachSwarm({playerId,effectId,bucket}:{playerId:string;effectId:string;bucket:number}) {
  return <div className="roach-swarm" aria-hidden="true">{Array.from({length:8},(_,index)=>{
    const seed=hash(effectId+':'+playerId+':'+bucket+':'+index);
    const left=4+seed%82,top=4+Math.floor(seed/83)%80;
    const size=28+Math.floor(seed/997)%23;
    const rotation=seed%90-45;
    return <img key={index} src="/cute-roach.webp" alt="" style={{left:left+'%',top:top+'%',width:size+'px',transform:'rotate('+rotation+'deg)',animationDelay:(index%7)*-.3+'s'}}/>;
  })}</div>;
}
