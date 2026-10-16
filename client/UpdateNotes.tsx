import {Button} from '@/components/ui/button';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import notes from './update-notes.md?raw';

export function UpdateNotes({version}:{version:string}){
  return <Dialog>
    <DialogTrigger asChild><button type="button" className="app-version" aria-label={`查看更新说明，当前版本 ${version}`}>v{version}</button></DialogTrigger>
    <DialogContent className="update-notes-dialog">
      <DialogHeader>
        <DialogTitle>更新说明</DialogTitle>
        <DialogDescription>当前版本 v{version}</DialogDescription>
      </DialogHeader>
      <div className="update-notes-content">
        {notes.trim().split(/\r?\n/).map((line,index)=>{
          const heading=line.match(/^##\s*(.+)$/);
          if(heading)return <h3 key={index}>{heading[1]}</h3>;
          if(!line.trim())return null;
          return <p key={index}>{line}</p>;
        })}
      </div>
      <DialogClose asChild><Button variant="outline" className="update-notes-close">关闭</Button></DialogClose>
    </DialogContent>
  </Dialog>;
}
