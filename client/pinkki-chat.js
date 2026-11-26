// Pinkki Universe UI and wire contract v1. Vendored unchanged by both web clients.
const categories = {ygo:'猜卡房间',tabletop:'桌游房间',qq:'QQ群',minecraft:'Minecraft 服务器'};
const sources = {...categories,pinkki:'粉红宇宙'};
const coverageLabels = {all:'全量接收',mentions:'接收提及',unknown:'接收范围待验证'};
const phases = {waiting:'等待中',playing:'进行中',finished:'已结束',closed:'已关闭',unknown:'暂时离线'};
const clock = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'});
const css = `
:host{display:block;color:var(--pu-text);--pu-bg:#fffdfa;--pu-surface:#faf6f3;--pu-text:#352a31;--pu-muted:#63545b;--pu-border:#e3d7dd;--pu-accent:#9c2458;--pu-badge:#ffedf5;--pu-shadow:#2d172637;--pu-focus:#b73873}
:host([theme=dark]){--pu-bg:#1e2722;--pu-surface:#28332d;--pu-text:#f3f1ee;--pu-muted:#bfc7c0;--pu-border:#49564d;--pu-accent:#ffadd0;--pu-badge:#442839;--pu-shadow:#0008;--pu-focus:#ffadd0}
*{box-sizing:border-box} [hidden]{display:none!important}
button,textarea{font:inherit;color:inherit}
button{cursor:pointer;padding:0;border:1px solid var(--pu-border);border-radius:8px;background:var(--pu-bg);min-height:36px}
button:disabled{cursor:default;opacity:.65} button:focus-visible,textarea:focus-visible{outline:2px solid var(--pu-focus);outline-offset:2px}
.entry{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:45;padding:0 14px;color:var(--pu-accent);font-weight:700;background:var(--pu-badge);box-shadow:0 4px 22px var(--pu-shadow)}
.panel{background:var(--pu-bg);border:1px solid var(--pu-border);border-radius:12px;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto auto;height:clamp(370px,67vh,650px);min-width:0;overflow:hidden;font:14px/1.45 system-ui,sans-serif;z-index:46}
:host(:not([in-room])) .panel{position:fixed;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));box-shadow:0 8px 32px var(--pu-shadow)}
header{grid-row:1;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 12px 8px}
header h2{font-size:16px;line-height:1.3;margin:0;overflow-wrap:anywhere}
header .top-buttons{display:flex;align-items:center;gap:4px;flex-shrink:0}
.badge{background:var(--pu-badge);color:var(--pu-accent);border-radius:6px;font-size:12px;font-weight:700;padding:4px 6px;white-space:nowrap}
.close{border:0;min-height:34px;min-width:34px;font-size:18px}
.members{background:none;border:0;color:var(--pu-muted);min-height:28px;text-align:left;font-size:12px}
nav{grid-row:2;display:flex;gap:4px;padding:0 8px 6px;border-bottom:1px solid var(--pu-border);overflow-x:auto}
nav button{background:none;border-color:transparent;padding:0 6px;white-space:nowrap;font-size:13px}
nav [aria-pressed=true]{background:var(--pu-badge);color:var(--pu-accent);font-weight:700}
.notice{grid-row:3;padding:3px 12px;color:var(--pu-muted);min-height:0;overflow-wrap:anywhere}
.notice:empty{display:none}
.scroll{grid-row:4;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:8px 12px;outline:none}
ul{padding:0;margin:0;list-style:none}.row{margin:0 0 9px;overflow-wrap:anywhere}
.meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;color:var(--pu-muted);font-size:11px}
.meta strong{color:var(--pu-text);font-size:13px}.actor-source{color:var(--pu-accent)}
.body{margin:1px 0;white-space:pre-wrap}.system{color:var(--pu-muted);font-size:12px;background:var(--pu-surface);padding:5px 8px;border-radius:7px}
.item-card{border-left:2px solid var(--pu-accent)}.pending{color:var(--pu-muted)}.failed{color:var(--pu-accent)}
.jump{grid-row:5;margin:2px 12px;color:var(--pu-accent)}.history{width:100%;margin-bottom:8px;color:var(--pu-muted)}
form{grid-row:6;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;padding:9px 12px max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--pu-border)}
textarea{resize:none;width:100%;padding:7px 8px;min-height:36px;max-height:120px;border:1px solid var(--pu-border);border-radius:8px;background:var(--pu-surface)}
form button{font-weight:700;color:var(--pu-accent);background:var(--pu-badge);padding:0 11px}
.hint{grid-column:1/-1;font-size:11px;color:var(--pu-muted);margin:0}
.list-set{margin:2px 0 10px}.list-set>h3{font-size:12px;color:var(--pu-muted);margin:2px 0 4px}
.channel{display:flex;justify-content:space-between;align-items:center;gap:5px;margin:5px 0}
.channel .select{flex:1;text-align:left;padding:5px 8px;min-width:0;overflow-wrap:anywhere}
.channel .toggle{padding:0 6px}.count{color:var(--pu-accent);font-size:12px}.empty{color:var(--pu-muted)}
.preference{display:flex;align-items:center;gap:6px;margin:0 0 12px}
@media(max-width:899px){
  .entry{bottom:max(12px,env(safe-area-inset-bottom))}
  :host([in-room]) .panel,:host(:not([in-room])) .panel{position:fixed;inset:auto 0 var(--pu-keyboard,0px);width:100%;height:min(560px,calc(var(--pu-viewport,100dvh) - 6px));border-radius:14px 14px 0 0;box-shadow:0 -5px 24px var(--pu-shadow)}
  form textarea{font-size:16px} button{min-height:42px}
}`;
function node(tag, cls, text) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
}
const button = (text, cls, fn) => {
    const element = node('button',cls,text);
    element.type = 'button';
    element.addEventListener('click',fn);
    return element;
};

export function chatApiUrl(root, path) {
    const base = new URL(root);
    base.pathname = base.pathname.replace(/\/+$/, '') + '/';
    return new URL('v1' + path, base);
}

class PinkkiChatPanel extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode:'open'});
        this.settings = {};
        this.channels = new Map();
        this.subscribed = new Set();
        this.messages = new Map();
        this.cursor = new Map();
        this.drafts = new Map();
        this.unread = new Map();
        this.pending = new Map();
        this.localMessages = [];
        this.active = '$local';
        this.view = 'chat';
        this.ready = false;
        this.generation = 0;
    }
    connectedCallback() {
        if (!this.panel) this.build();
        const viewport = globalThis.visualViewport;
        this.resize = () => {
            if (!viewport) return;
            this.style.setProperty('--pu-viewport',viewport.height+'px');
            this.style.setProperty('--pu-keyboard',Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop)+'px');
        };
        viewport?.addEventListener('resize',this.resize);
        viewport?.addEventListener('scroll',this.resize);
        this.resize();
        this.render();
    }
    disconnectedCallback() {
        globalThis.visualViewport?.removeEventListener('resize',this.resize);
        globalThis.visualViewport?.removeEventListener('scroll',this.resize);
        this.configure({});
    }
    build() {
        const style = node('style');
        style.textContent = css;
        this.entry = button('粉红宇宙','entry',()=>this.toggle(true));
        this.panel = node('section','panel chat-panel');
        this.panel.setAttribute('aria-label','粉红宇宙聊天');
        const header = node('header');
        this.headingTitle = node('h2');
        this.memberButton = button('在线','members',()=>this.setView('members'));
        const heading = node('div');
        heading.append(this.headingTitle,this.memberButton);
        const tools = node('div','top-buttons');
        this.closeButton = button('×','close',()=>this.toggle(false));
        this.closeButton.setAttribute('aria-label','关闭聊天面板');
        tools.append(node('span','badge','粉红宇宙'),this.closeButton);
        header.append(heading,tools);
        this.nav = node('nav');
        this.nav.setAttribute('aria-label','频道导航');
        this.tabs = [
            ['local',button('本房间',null,()=>{this.active='$local';this.setView('chat',true);})],
            ['subscriptions',button('我的订阅',null,()=>this.setView('subscriptions'))],
            ['directory',button('发现频道',null,()=>this.setView('directory'))],
        ];
        this.nav.append(...this.tabs.map(([,element])=>element));
        this.notice = node('div','notice');
        this.notice.setAttribute('role','status');
        this.scroller = node('div','scroll chat-messages');
        this.scroller.setAttribute('aria-label','聊天记录');
        this.scroller.tabIndex = 0;
        this.scroller.addEventListener('scroll',()=>{
            if(this.view==='chat' && this.nearEnd()) this.jump.hidden=true;
        });
        this.jump = button('查看新消息','jump',()=>this.toEnd());
        this.jump.hidden = true;
        this.form = node('form','chat-compose');
        this.input = node('textarea');
        this.input.rows = 1;
        this.input.setAttribute('aria-label','聊天内容');
        this.input.setAttribute('enterkeyhint','send');
        this.input.addEventListener('input',()=>{
            this.drafts.set(this.active,this.input.value);
            this.updateForm();
        });
        this.input.addEventListener('keydown',event=>{
            if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229) {
                event.preventDefault();
                if(!this.submit.disabled) this.form.requestSubmit();
            }
        });
        this.submit = node('button',null,'发送');
        this.submit.type='submit';
        this.hint = node('p','hint');
        this.form.append(this.input,this.submit,this.hint);
        this.form.addEventListener('submit',event=>{event.preventDefault();void this.sendMessage();});
        this.panel.append(header,this.nav,this.notice,this.scroller,this.jump,this.form);
        this.panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.closeButton.hidden)this.toggle(false);});
        this.shadowRoot.append(style,this.entry,this.panel);
    }
    configure(next) {
        const old = this.settings;
        const changed = old.url!==next.url || old.identity!==next.identity;
        const roomChanged = old.room!==next.room;
        if(changed) this.disconnect(old.url);
        this.settings = next;
        if (!this.panel) return;
        this.toggleAttribute('in-room',!!next.room);
        if (changed) {
            this.channels.clear();
            this.subscribed.clear();
            this.messages.clear();
            this.cursor.clear();
            this.drafts.clear();
            this.unread.clear();
            this.pending.clear();
            this.active='$local';
            this.view='chat';
            if(next.url) this.connect();
        }
        if(roomChanged) {
            this.localMessages=[];
            this.drafts.delete('$local');
            if(this.active==='$local') this.input.value='';
            if(next.room && !matchMedia('(max-width:899px)').matches) this.open=true;
            if(!next.room&&this.view==='chat'&&this.active==='$local') this.view='subscriptions';
            this.wireFocus();
        }
        this.render(roomChanged||changed);
    }
    setLocal(messages) {
        this.localMessages = messages;
        if(this.active==='$local'&&this.view==='chat') this.renderContent();
    }
    toggle(open) {
        this.open=open;
        if(open&&this.active==='$local'&&!this.settings.room) this.view='subscriptions';
        if(open) this.unread.delete(this.active);
        this.wireFocus();
        this.render(true);
        if(open) this.closeButton.focus(); else this.entry.focus();
    }
    async request(path,method='GET',body,token=this.token) {
        const headers = {};
        if(token) headers.Authorization='Bearer '+token;
        if(body!==undefined) headers['Content-Type']='application/json';
        const response=await fetch(chatApiUrl(this.settings.url,path),{
            method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000),redirect:'error',
        });
        const data=await response.json();
        if(!response.ok) throw Error(data.error||'聊天请求失败');
        return data;
    }
    disconnect(url) {
        this.generation++;
        this.ready=false;
        clearTimeout(this.retry);
        this.socket?.close();
        if(this.token && url) void fetch(chatApiUrl(url,'/sessions'),{method:'DELETE',redirect:'error',
            headers:{Authorization:'Bearer '+this.token}}).catch(()=>{});
        this.token=null;
    }
    async connect() {
        const generation=this.generation;
        const retry=()=>{
            if(generation!==this.generation||!this.isConnected) return;
            this.ready=false;
            for(const item of this.pending.values()) if(item.state==='pending') item.state='确认中';
            this.notice.textContent='聊天连接已断开，正在重连';
            this.retry=setTimeout(()=>this.connect(),1800);
            this.updateForm();
        };
        try {
            const raw=this.settings.token?.();
            if(raw) {
                const origin=new URL(this.settings.url);
                if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) {
                    throw Error('聊天服务必须使用 HTTPS');
                }
                const value=(await this.request('/sessions','POST',undefined,raw)).token;
                if(generation!==this.generation||!this.isConnected) return;
                this.token=value;
            }
            if(generation!==this.generation||!this.isConnected) return;
            const address=chatApiUrl(this.settings.url,'/ws');
            address.protocol=address.protocol==='https:'?'wss:':'ws:';
            const socket=new WebSocket(address);
            this.socket=socket;
            socket.onopen=()=>this.wire({type:'auth',token:this.token??undefined});
            socket.onmessage=event=>{if(generation===this.generation) this.receive(JSON.parse(event.data));};
            socket.onerror=()=>socket.close();
            socket.onclose=()=>{if(this.socket===socket)retry();};
        } catch(error) {
            retry();
            if(generation===this.generation) this.notice.textContent=error.message;
        }
    }
    wire(value) {
        if(this.socket?.readyState!==WebSocket.OPEN) return false;
        this.socket.send(JSON.stringify(value));
        return true;
    }
    async directory() {
        if(!this.settings.url) return;
        const generation=this.generation;
        try {
            const {channels}=await this.request('/channels');
            if(generation!==this.generation)return;
            const retained=[...this.channels].filter(([id])=>this.subscribed.has(id));
            this.channels=new Map([...retained,...channels.map(channel=>[channel.id,channel])]);
            this.render(false,this.view!=='chat');
        } catch(error) {if(generation===this.generation)this.notice.textContent=error.message;}
    }
    subscribe(id) {
        const after=this.cursor.get(id);
        this.wire({type:'subscribe',channel:id,after});
    }
    wireFocus() {
        if(!this.ready) return;
        const channel=this.open && (this.view==='chat'||this.view==='members') ? (this.active==='$local'?this.settings.room:this.active):null;
        this.wire({type:'focus',channel:channel??null});
    }
    receive(message) {
        switch(message.type) {
        case 'ready': {
            this.ready=true;
            this.authenticated=message.authenticated;
            this.listed=message.listed;
            const restored=message.authenticated?message.subscriptions:[...this.subscribed];
            this.subscribed=new Set(restored);
            for(const id of restored)this.subscribe(id);
            for(const [id,item] of this.pending) if(item.state==='确认中') {
                this.wire({type:'send',channel:item.channel,id,text:item.text});
            }
            this.wireFocus();
            void this.directory();
            this.notice.textContent='';
            this.render();
            break;
        }
        case 'subscribed':
            this.channels.set(message.channel.id,message.channel);
            this.subscribed.add(message.channel.id);
            this.merge(message.channel.id,message.messages);
            this.render(false,this.view!=='chat'||this.active===message.channel.id);
            break;
        case 'subscription.changed':
            if(message.subscribed) {if(!this.subscribed.has(message.channel))this.subscribe(message.channel);}
            else {
                this.subscribed.delete(message.channel);
                this.cursor.delete(message.channel);
                this.messages.delete(message.channel);
                this.unread.delete(message.channel);
                if(this.active===message.channel) {this.active='$local';this.view='subscriptions';this.wireFocus();}
                this.render(true);
            }
            break;
        case 'channel.hidden':
            if(!this.subscribed.has(message.channel)) this.channels.delete(message.channel);
            this.render(false,this.view!=='chat');
            break;
        case 'channel.state':
            this.channels.set(message.channel.id,message.channel);
            this.render(false,this.view!=='chat');
            break;
        case 'channel.revoked':
            this.channels.delete(message.channel);
            this.subscribed.delete(message.channel);
            this.cursor.delete(message.channel);
            this.messages.delete(message.channel);
            this.unread.delete(message.channel);
            if(this.active===message.channel) {this.active='$local';this.setView('subscriptions',true);}
            else this.render(false,this.view!=='chat');
            break;
        case 'message.created': {
            const known=this.messages.get(message.channel)?.some(item=>item.id===message.message.id);
            this.merge(message.channel,[message.message]);
            const visible=this.open&&this.active===message.channel&&this.view==='chat';
            if(!visible&&!known) this.unread.set(message.channel,(this.unread.get(message.channel)||0)+1);
            this.render(false,visible||this.view==='subscriptions');
            break;
        }
        case 'presence.changed':
            if(message.channel===(this.active==='$local'?this.settings.room:this.active)) {
                this.presence=message;
                this.render(false,this.view==='members');
            }
            break;
        case 'send.result': {
            const item=this.pending.get(message.id);
            if(item) {
                if(message.state==='sent') this.pending.delete(message.id);
                else item.state=message.state==='failed'?(message.error||'发送失败'):'pending';
                this.render(false,this.active===item.channel&&this.view==='chat');
            }
            break;
        }
        case 'error':this.notice.textContent=message.error;break;
        }
    }
    merge(id,incoming,live=true) {
        const previous=this.messages.get(id)||[];
        const byId=new Map(previous.map(item=>[item.id,item]));
        for(const item of incoming) byId.set(item.id,item);
        const merged=[...byId.values()].sort((a,b)=>a.seq-b.seq);
        this.messages.set(id,merged.slice(-1000));
        if(live&&incoming.length) this.cursor.set(id,Math.max(this.cursor.get(id)||0,incoming.at(-1).seq));
    }
    async older() {
        const channel=this.active;
        const first=this.messages.get(channel)?.[0]?.seq;
        const position=this.scroller.scrollHeight-this.scroller.scrollTop;
        try {
            const {messages}=await this.request('/channels/'+encodeURIComponent(channel)+'/history'+(first?'?before='+first:''));
            if(this.active!==channel)return;
            if(!messages.length) {this.notice.textContent='没有更早的消息';return;}
            this.merge(channel,messages,false);
            this.renderContent(false);
            this.scroller.scrollTop=this.scroller.scrollHeight-position;
        } catch(error){this.notice.textContent=error.message;}
    }
    openChannel(id) {
        if(!this.subscribed.has(id)) this.subscribe(id);
        this.active=id;
        this.open=true;
        this.presence=null;
        this.unread.delete(id);
        this.setView('chat',true);
    }
    setView(view,reset=false) {
        this.view=view;
        if(view==='directory') void this.directory();
        if(view==='members') {
            const id=this.active==='$local'?this.settings.room:this.active;
            if(id&&this.authenticated) void this.request('/channels/'+encodeURIComponent(id)+'/members')
                .then(value=>{if(id===(this.active==='$local'?this.settings.room:this.active)){
                    this.presence={channel:id,...value};this.render(false,this.view==='members');
                }}).catch(error=>{this.notice.textContent=error.message;});
        }
        this.input.value=this.drafts.get(this.active)||'';
        this.wireFocus();
        this.render(reset);
    }
    nearEnd() {return this.scroller.scrollHeight-this.scroller.scrollTop-this.scroller.clientHeight<40;}
    toEnd() {this.scroller.scrollTop=this.scroller.scrollHeight;this.jump.hidden=true;}
    channelRow(info,discovery) {
        const row=node('li','channel');
        const id=info.id;
        const unread=this.unread.get(id)||0;
        const state=info.phase?phases[info.phase]:'';
        const tail=[state,coverageLabels[info.coverage],Number.isFinite(info.updatedAt)?clock.format(info.updatedAt):'',info.writable===false?'只读':'',unread?unread+' 条未读':''].filter(Boolean).join(' · ');
        row.append(button(info.name+(tail?' · '+tail:''),'select',()=>this.openChannel(id)));
        if(!discovery||this.subscribed.has(id)) row.append(button('取消订阅','toggle',()=>this.wire({type:'unsubscribe',channel:id})));
        else row.append(button('订阅','toggle',()=>this.openChannel(id)));
        return row;
    }
    renderContent(reset=false) {
        const end=reset||this.nearEnd();
        const top=this.scroller.scrollTop;
        this.scroller.replaceChildren();
        let jump=false;
        if(this.view==='chat') {
            const messages=this.active==='$local'?this.localMessages:(this.messages.get(this.active)||[]);
            const list=node('ul');
            list.setAttribute('aria-label','消息');
            list.setAttribute('role','log');
            if(this.active!=='$local') this.scroller.append(button('查看更早消息','history',()=>void this.older()));
            if(!messages.length) list.append(node('li','empty','暂无消息'));
            for(const item of messages) {
                const li=node('li',item.system?'row system system-message '+(item.kind||''):'row');
                if(!item.system) {
                    const meta=node('div','meta');
                    const author=node('strong',null,item.actor?.name||item.name||'玩家');
                    if(item.authorSlot) {
                        const slot=node('slot',null,author.textContent);
                        slot.name=item.authorSlot;
                        author.replaceChildren(slot);
                    }
                    meta.append(author);
                    const source=sources[item.actor?.source||item.source];
                    if(source)meta.append(node('span','actor-source',source));
                    if(Number.isFinite(item.time))meta.append(node('time',null,clock.format(item.time)));
                    li.append(meta);
                }
                li.append(node('p','body',item.text));
                list.append(li);
            }
            for(const item of this.pending.values()) if(item.channel===this.active) {
                const state=item.state==='pending'?'待确认':item.state;
                const li=node('li','row '+(state==='待确认'||state==='确认中'?'pending':'failed'));
                li.append(node('strong',null,state),node('p','body',item.text));
                list.append(li);
            }
            this.scroller.append(list);
            if(end) this.toEnd(); else {this.scroller.scrollTop=top;jump=true;}
        } else if(this.view==='members') {
            if(!this.authenticated) this.scroller.append(node('p','empty','登录后查看活跃用户'));
            else {
                const label=node('label','preference');
                const input=node('input');
                input.type='checkbox';
                input.checked=!!this.listed;
                input.addEventListener('change',async()=>{
                    try {this.listed=(await this.request('/profile','PATCH',{listed:input.checked})).listed;}
                    catch(error){input.checked=!!this.listed;this.notice.textContent=error.message;}
                });
                label.append(input,document.createTextNode('允许在活跃名单中展示我的昵称'));
                this.scroller.append(label);
                const list=node('ul');
                for(const item of this.presence?.members||[]) list.append(node('li','row',item.name+' · '+(sources[item.source]||'')));
                if(!list.children.length) list.append(node('li','empty','暂无公开的活跃成员'));
                this.scroller.append(list);
            }
            this.scroller.append(button('返回聊天','history',()=>this.setView('chat',true)));
        } else {
            const directory=this.view==='directory';
            const items=directory?[...this.channels.values()].filter(item=>item.phase!=='closed'):
                [...this.subscribed].map(id=>this.channels.get(id)).filter(Boolean);
            if(!items.length) this.scroller.append(node('p','empty',this.ready?(directory?'暂无活跃频道':'暂无订阅频道'):'集中聊天未连接'));
            for(const category of Object.keys(categories)) {
                const selected=items.filter(item=>item.category===category);
                if(!selected.length)continue;
                const section=node('section','list-set');
                const list=node('ul');
                section.append(node('h3',null,categories[category]),list);
                for(const info of selected)list.append(this.channelRow(info,directory));
                this.scroller.append(section);
            }
        }
        this.jump.hidden=!jump;
    }
    updateForm() {
        const local=this.active==='$local';
        const channel=this.channels.get(this.active);
        const max=local?(this.settings.maxLength||500):(channel?.maxLength||500);
        const reason=local?(this.settings.localReady?'':'房间未连接'):
            (!this.ready?'聊天连接中':channel?.writable?'':channel?.readonlyReason||'当前频道只读');
        this.form.hidden=this.view!=='chat';
        this.input.disabled=!!reason;
        this.input.placeholder=reason||'输入消息';
        this.input.maxLength=max;
        this.submit.disabled=!!reason||!this.input.value.trim();
        this.hint.textContent=reason||this.input.value.length+' / '+max;
    }
    render(reset=false,content=true) {
        if(!this.panel)return;
        this.entry.hidden=!!this.open;
        this.panel.hidden=!this.open;
        const unread=[...this.unread.values()].reduce((a,b)=>a+b,0);
        this.entry.textContent='粉红宇宙'+(unread?' · '+unread:'');
        const current=this.active==='$local'?this.settings.room:this.active;
        const channel=this.channels.get(current);
        this.headingTitle.textContent=this.active==='$local'?(this.settings.room?'本房间':'我的订阅'):channel?.name||'频道';
        const count=this.presence?.channel===current?this.presence?.count:(channel?.memberCount??this.settings.localCount);
        this.memberButton.hidden=!current;
        this.memberButton.textContent=(count??0)+' 人在线'+(channel?.phase?' · '+phases[channel.phase]:'');
        for(const [view,item] of this.tabs) {
            item.hidden=view==='local'&&!this.settings.room;
            item.setAttribute('aria-pressed',String(this.view===view||(view==='local'&&this.view==='chat'&&this.active==='$local')));
        }
        this.updateForm();
        if(content&&this.open)this.renderContent(reset);
    }
    async sendMessage() {
        const text=this.input.value.trim();
        if(this.submit.disabled||!text)return;
        const channel=this.active;
        this.drafts.delete(channel);
        this.input.value='';
        this.updateForm();
        if(channel==='$local') {
            try {
                const sent=await this.settings.localSend?.(text);
                if(sent===false)throw Error('房间未连接');
            } catch(error) {
                this.drafts.set(channel,text);
                if(this.active===channel)this.input.value=text;
                this.notice.textContent=error.message;
                this.updateForm();
            }
        } else {
            const id=crypto.randomUUID();
            this.pending.set(id,{channel,text,state:'pending'});
            if(!this.wire({type:'send',channel,id,text}))this.pending.get(id).state='连接已断开';
            while(this.pending.size>100)this.pending.delete(this.pending.keys().next().value);
            this.renderContent(true);
        }
    }
}
if(!customElements.get('pinkki-chat-panel')) customElements.define('pinkki-chat-panel',PinkkiChatPanel);
export const CHAT_PANEL_VERSION = 1;
