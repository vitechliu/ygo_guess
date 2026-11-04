import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { User } from './game';
import { loginPink, unlinkPink } from './pink-auth';

export function PinkLogin({ user, onChange, disabled }: { user: User | null; onChange: (user: User) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'code' | 'password'>('code');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changeOpen = (value: boolean) => {
    if (busy) return;
    setOpen(value); setCode(''); setPassword(''); setUsername(''); setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    setBusy(true); setError('');
    try {
      const next = await loginPink(method, { code, username, password });
      onChange(next); setOpen(false); setCode(''); setPassword(''); setUsername(''); toast.success('已关联粉红账号');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  const unlink = async () => {
    setBusy(true); setError('');
    try { const next = await unlinkPink(); if (next) onChange(next); setOpen(false); toast.success('已解除关联，可以继续以游客游玩'); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="pink-link"><Link2 size={16}/>{user?.pink ? '已关联' : '粉红登录'}</Button></DialogTrigger>
    <DialogContent className="pink-dialog" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{user?.pink ? '已关联粉红账号' : '关联粉红账号'}</DialogTitle><DialogDescription>可选登录，用于记住账号和对局统计，游客也能正常游玩。</DialogDescription></DialogHeader>
      {user?.pink ? <div className="pink-form"><p>当前账号：<strong>{user.pink.name}</strong></p><p className="hint">游戏昵称可自由修改。解除关联后仍可继续使用游客；切换账号请先解除关联。</p><Button disabled={busy} type="button" variant="outline" onClick={() => void unlink()}>{busy && <Loader2 className="spin" size={16}/>}解除关联</Button></div> : <form onSubmit={submit} className="pink-form">
        <Tabs value={method} onValueChange={v => { setMethod(v as 'code' | 'password'); setError(''); setPassword(''); setCode(''); }}><TabsList className="entry-tabs"><TabsTrigger value="code" disabled={busy}>关联码</TabsTrigger><TabsTrigger value="password" disabled={busy}>账号密码</TabsTrigger></TabsList></Tabs>
        {method === 'code' ? <><label htmlFor="pink-code">关联码</label><input id="pink-code" className="text-input" autoComplete="off" placeholder="输入6位关联码" value={code} onChange={e => setCode(e.target.value)} minLength={6} maxLength={6} required disabled={busy}/><p className="hint">向粉红机器人发送“关联码”获取，5 分钟内有效，成功使用后失效。</p></> : <><label htmlFor="pink-username">用户名</label><input id="pink-username" className="text-input" autoComplete="username" placeholder="输入粉红网站用户名" value={username} onChange={e => setUsername(e.target.value)} maxLength={255} required disabled={busy}/><label htmlFor="pink-password">密码</label><input id="pink-password" className="text-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy}/></>}
        <Button type="submit" className="primary" disabled={busy}>{busy && <Loader2 className="spin" size={16}/>}关联账号</Button><p className="hint">需已关联机器人账号。关联后自动填入机器人昵称。</p>
      </form>}
      {error && <p className="pink-error" role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
