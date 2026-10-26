import {useEffect,useId,useRef,type ImgHTMLAttributes} from 'react';
import displacementMap from './assets/outer-entity-displacement.png?inline';
import './outer-entity.css';

type Props=ImgHTMLAttributes<HTMLImageElement>&{active:boolean;seed:number};

// Animate a small, precomputed vector field, rather than regenerating turbulence.
// Only the picture is filtered: covers, badges and other card effects stay outside.
export function OuterEntityImage({active,seed,...imageProps}:Props){
  const id='outer-entity-'+useId().replace(/:/g,'');
  const root=useRef<HTMLSpanElement>(null);
  const surface=useRef<HTMLSpanElement>(null);
  const displacement=useRef<SVGFEDisplacementMapElement>(null);
  useEffect(()=>{
    const element=root.current,plane=surface.current,map=displacement.current;
    if(!active||!element||!plane||!map)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const mobile=matchMedia('(max-width: 600px)');
    let visible=false,timer:ReturnType<typeof setTimeout>|undefined;
    const started=performance.now();
    let filtered=false;
    const tick=()=>{
      clearTimeout(timer);
      const running=visible&&!document.hidden;
      element.dataset.running=String(running&&!reduced.matches);
      // A long quiet breath, then a slow squeeze and a sharper release.
      const phase=((performance.now()-started+seed*1379)%10000)/10000;
      const pulse=phase<.34?Math.pow(Math.sin(Math.PI*phase/.34),1.3):0;
      const strength=reduced.matches?14:running?pulse*(mobile.matches?38:48):0;
      // Bounding-box units keep the field aligned with the picture on mobile too.
      map.setAttribute('scale',(strength/230).toFixed(4));
      const needsFilter=strength>.1;
      if(filtered!==needsFilter){
        plane.style.filter=needsFilter?'url(#'+id+')':'none';
        filtered=needsFilter;
      }
      if(running&&!reduced.matches)timer=setTimeout(tick,pulse>0?(mobile.matches?80:50):250);
    };
    const observer=new IntersectionObserver(entries=>{
      visible=entries[0]?.isIntersecting??false;
      tick();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange',tick);
    reduced.addEventListener('change',tick);
    mobile.addEventListener('change',tick);
    return()=>{
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange',tick);
      reduced.removeEventListener('change',tick);
      mobile.removeEventListener('change',tick);
    };
  },[active,id,seed]);
  if(!active)return <img {...imageProps}/>;
  return <span className="outer-entity-image" ref={root} data-running="false" style={{animationDelay:`${-seed*1.379}s`}}>
    <svg className="outer-entity-defs" aria-hidden="true" width="1" height="1">
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
          <feImage href={displacementMap} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="gaze"/>
          <feDisplacementMap ref={displacement} in="SourceGraphic" in2="gaze" scale="0" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
    </svg>
    <span className="outer-entity-surface" ref={surface}><img {...imageProps}/></span>
    <span className="outer-entity-gaze" aria-hidden="true"/>
  </span>;
}
