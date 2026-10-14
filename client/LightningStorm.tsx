function position(seed:string) {
  let hash=2166136261;
  for(const char of seed)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return 12+(hash>>>0)%76;
}

export function LightningStorm({effectId,bucket}:{effectId:string;bucket:number}) {
  return <div className="lightning-storm" aria-hidden="true" key={effectId+'-'+bucket}>
    {[0,1].map(index=><svg key={index} className="lightning-bolt" style={{left:position(effectId+bucket+index)+'%',animationDelay:index?'0.55s':'0s'}} viewBox="0 0 100 300" preserveAspectRatio="none"><path d="M62 0 29 128 53 125 18 300 83 107 55 113 92 0"/></svg>)}
  </div>;
}
