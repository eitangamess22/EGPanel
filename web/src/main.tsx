import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Archive, Box, Boxes, ChevronDown, Copy, Cpu, Folder, Gamepad2,
  HardDrive, KeyRound, LayoutDashboard, LogOut, Menu, Network, Play,
  RotateCcw, Search, Settings, Square, Terminal, Upload, Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./styles.css";

type IconType = LucideIcon;

const nav: { label: string; icon: IconType; section?: boolean }[] = [
  { label: "Servers", icon: Box, section: true },
  { label: "Templates", icon: LayoutDashboard },
  { label: "Nodes", icon: Network },
  { label: "Users", icon: Users },
  { label: "API Keys", icon: KeyRound },
  { label: "Settings", icon: Settings },
  { label: "Audit Log", icon: Archive, section: true },
  { label: "Backups", icon: Archive },
  { label: "Schedules", icon: RotateCcw },
];

function Logo() {
  return (
    <div className="flex h-9 items-center gap-2 px-3">
      <div className="grid h-4 w-4 place-items-center rounded-[4px] bg-accent text-[8px] font-bold">EG</div>
      <span className="text-[16px] font-semibold tracking-[-0.02em]">EGPanel</span>
    </div>
  );
}

function Button({ children, variant = "secondary", icon: Icon }: { children: React.ReactNode; variant?: "primary"|"secondary"|"danger"; icon?: IconType }) {
  const styles = variant === "primary"
    ? "border-accent/70 bg-accent text-white hover:bg-[#5B9BFF]"
    : variant === "danger"
      ? "border-danger/40 bg-danger/10 text-[#ff8f8f] hover:bg-danger/15"
      : "border-hairline bg-raised text-foreground hover:border-[#34343a]";
  return (
    <button className={`inline-flex h-8 items-center gap-2 rounded-control border px-3 text-[12px] font-medium transition-colors duration-[150ms] ${styles}`}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, detail, color }: { icon: IconType; label: string; value: string; detail: string; color: string }) {
  return (
    <div className="min-w-0 border-r border-hairline px-3 py-3 last:border-r-0">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted"><Icon size={13} className={color} /><span>{label}</span></div>
      <div className="font-mono text-[14px] font-semibold">{value}</div>
      <div className="mt-2 h-6 w-full overflow-hidden rounded-[3px]">
        <svg viewBox="0 0 220 24" preserveAspectRatio="none" className="h-full w-full">
          <path d={`M0 20 ${detail}`} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  return (
    <aside className={`${collapsed ? "w-[56px]" : "w-sidebar"} fixed inset-y-0 left-0 z-20 border-r border-hairline bg-[#101011] transition-[width] duration-[180ms]`}>
      <Logo />
      <button onClick={() => setCollapsed(!collapsed)} className="absolute right-[-12px] top-[14px] hidden h-6 w-6 place-items-center rounded-[4px] border border-hairline bg-raised text-muted md:grid" aria-label="Toggle sidebar">
        <Menu size={13} />
      </button>
      <nav className="mt-5 px-2">
        {nav.map((item) => (
          <button key={item.label} className={`mb-0.5 flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-[12px] text-muted transition-colors hover:bg-raised hover:text-foreground ${item.label === "Servers" ? "bg-[#18243A] text-[#8DB8FF]" : ""}`}>
            <item.icon size={14} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 h-12 border-t border-hairline px-2">
        <button className="mt-2 flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-[12px] text-muted hover:bg-raised">
          <div className="grid h-6 w-6 place-items-center rounded-[4px] bg-[#29292e] text-[10px] font-semibold text-foreground">JD</div>
          {!collapsed && <><span className="flex-1 text-left text-foreground">John Doe</span><LogOut size={13} /></>}
        </button>
      </div>
    </aside>
  );
}

function CommandPalette({ open, close }: { open: boolean; close: () => void }) {
  if (!open) return null;
  return (
    <div onMouseDown={close} className="fixed inset-0 z-50 bg-black/60 pt-[15vh]">
      <div onMouseDown={(event) => event.stopPropagation()} className="mx-auto w-[560px] max-w-[calc(100%-32px)] overflow-hidden rounded-panel border border-hairline bg-raised shadow-2xl">
        <div className="flex h-12 items-center gap-3 border-b border-hairline px-3">
          <Search size={16} className="text-muted" />
          <input autoFocus className="h-full flex-1 bg-transparent text-[13px] text-foreground outline-none" placeholder="Search servers, commands, or pages" />
          <kbd className="rounded-[4px] border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted">ESC</kbd>
        </div>
        <div className="p-2">
          <button className="flex h-9 w-full items-center gap-3 rounded-[5px] px-2 text-left text-[12px] hover:bg-[#202024]"><Terminal size={14} /><span>Survival Realm</span><span className="ml-auto text-muted">Server</span></button>
          <button className="flex h-9 w-full items-center gap-3 rounded-[5px] px-2 text-left text-[12px] hover:bg-[#202024]"><Play size={14} /><span>Start Survival Realm</span><span className="ml-auto text-muted">Command</span></button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main className={`${collapsed ? "ml-[56px]" : "ml-sidebar"} min-w-0 transition-[margin] duration-[180ms]`}>
        <header className="fixed left-[220px] right-0 top-0 z-10 flex h-9 items-center border-b border-hairline bg-[#101011] px-3 max-md:left-[56px]" style={{ left: collapsed ? 56 : undefined }}>
          <button className="flex h-7 w-[200px] items-center gap-2 rounded-control border border-hairline bg-[#151517] px-2 text-[12px]">
            <Gamepad2 size={14} className="text-success" /><span className="flex-1 text-left">Survival Realm</span><ChevronDown size={13} className="text-muted" />
          </button>
          <button onClick={() => setPalette(true)} className="mx-auto flex h-7 w-[340px] items-center gap-2 rounded-control border border-hairline bg-[#151517] px-2 text-[12px] text-muted max-lg:mx-4 max-md:hidden">
            <Search size={13} /><span className="flex-1 text-left">Search or run a command…</span><kbd className="font-mono text-[10px]">Ctrl+K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3"><span className="flex items-center gap-1.5 text-[10px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-success"></span>Panel Online</span><button aria-label="Settings"><Settings size={14} className="text-muted" /></button><button aria-label="Logout"><LogOut size={14} className="text-muted" /></button></div>
        </header>

        <div className="px-3 pt-[52px] pb-6 lg:px-5">
          <section className="mb-3 flex items-center">
            <div className="mr-4 grid h-14 w-14 place-items-center rounded-panel border border-hairline bg-[#1A1609]"><Box size={28} className="text-[#C7A95D]" /></div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-[18px] font-semibold tracking-tight">Survival Realm</h1><span className="flex items-center gap-1.5 rounded-[4px] bg-success/10 px-1.5 py-1 text-[10px] text-success"><span className="h-1.5 w-1.5 rounded-full bg-success"></span>Online</span></div>
              <p className="mt-1 text-[11px] text-muted">Minecraft Java · Paper 1.20.6</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button icon={RotateCcw} variant="primary">Restart</Button>
              <button aria-label="Restart options" className="h-8 w-8 rounded-control border border-hairline bg-raised text-muted hover:text-foreground"><ChevronDown size={13} className="mx-auto" /></button>
            </div>
          </section>

          <nav className="mb-3 flex h-9 items-end gap-4 border-b border-hairline text-[11px] text-muted">
            {[["Console", true], ["Overview", false], ["Files", false], ["Startup", false], ["Backups", false], ["Schedules", false], ["Players", false], ["Subusers", false], ["Network", false], ["Settings", false]].map(([label, active]) => (
              <button key={String(label)} className={`h-full border-b px-0.5 ${active ? "border-accent text-accent" : "border-transparent hover:text-foreground"}`}>{label}</button>
            ))}
          </nav>

          <section className="grid grid-cols-4 border-y border-hairline bg-surface max-md:grid-cols-2">
            <StatCard icon={Cpu} label="CPU Usage" value="12.4%" detail="M0 20 L20 18 L40 17 L60 19 L80 14 L100 16 L120 10 L140 12 L160 8 L180 13 L200 7 L220 10" color="#3B82F6" />
            <StatCard icon={Boxes} label="Memory Usage" value="1.2 GB / 4 GB" detail="M0 20 L20 18 L40 16 L60 17 L80 15 L100 10 L120 13 L140 8 L160 9 L180 6 L200 5 L220 4" color="#3B82F6" />
            <StatCard icon={HardDrive} label="Disk Usage" value="1.8 GB / 20 GB" detail="M0 20 L20 18 L40 15 L60 17 L80 12 L100 8 L120 10 L140 9 L160 5 L180 4 L200 3 L220 2" color="#A855F7" />
            <StatCard icon={Network} label="Network (↓ ↑)" value="2.3 KB/s | 1.1 KB/s" detail="M0 18 L20 16 L40 17 L60 10 L80 14 L100 20 L120 15 L140 12 L160 18 L180 20 L200 16 L220 8" color="#A855F7" />
          </section>

          <section className="mt-3">
            <div className="flex h-10 items-center justify-between px-1">
              <h2 className="text-[12px] font-semibold">Live Console</h2>
              <label className="flex items-center gap-2 text-[11px] text-muted">Auto-scroll
                <button onClick={() => setAutoscroll(!autoscroll)} className={`relative h-[16px] w-[28px] rounded-full transition-colors ${autoscroll ? "bg-accent" : "bg-raised"}`}><span className={`absolute top-[3px] h-[10px] w-[10px] rounded-full bg-white transition-transform ${autoscroll ? "left-[15px]" : "left-[3px]"}`} /></button>
              </label>
            </div>
            <div className="h-[220px] overflow-auto rounded-panel border border-hairline bg-console p-4 font-mono text-[11px] leading-6 text-[#CFCFD4]" aria-live="polite">
              <div><span className="[color:#777783]">[14:32:17]</span> <span className="[color:#5B9BFF]">[Server]</span> Starting Paper 1.20.6...</div>
              <div><span className="[color:#777783]">[14:32:18]</span> <span className="[color:#5B9BFF]">[Server]</span> Loading libraries, please wait...</div>
              <div><span className="[color:#777783]">[14:32:21]</span> <span className="[color:#5B9BFF]">[Server]</span> Done (4.8s)! For help, type "help"</div>
              <div><span className="[color:#777783]">[14:32:21]</span> <span className="[color:#22C55E]">[Server]</span> Timings Reset</div>
            </div>
            <form onSubmit={(event) => event.preventDefault()} className="mt-2 flex gap-2">
              <div className="flex h-9 flex-1 items-center rounded-control border border-hairline bg-surface pl-3 font-mono text-[12px]"><span className="mr-3 text-muted">&gt;_</span><input aria-label="Console command" className="h-full flex-1 bg-transparent pr-3 outline-none placeholder:text-[#5F5F67]" placeholder="Type a command" /></div>
              <Button variant="primary" icon={Terminal}>Send</Button>
            </form>
          </section>

          <section className="mt-4 grid grid-cols-[1.1fr_1.1fr_.8fr] gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
            <Panel title="Server Details" status="Online">
              {[["Address", "play.survivalrealm.gg:25565"], ["Uptime", "2h 14m 32s"], ["Memory", "1.2 GB / 4 GB"], ["CPU", "12.4%"], ["Disk", "1.8 GB / 20 GB"]].map(([key,value]) =>
                <div key={key} className="grid grid-cols-[100px_1fr_auto] items-center border-b border-hairline/70 px-3 py-2 last:border-b-0"><span className="text-[11px] text-muted">{key}</span><span className="font-mono text-[11px]">{value}</span>{key === "Address" && <Copy size={12} className="text-muted" />}</div>
              )}
            </Panel>
            <Panel title="Quick Actions">
              <div className="grid grid-cols-3 gap-2 p-3"><Button icon={Square}>Stop</Button><Button icon={RotateCcw} variant="primary">Restart</Button><Button icon={Square}>Kill</Button><Button icon={Archive}>Create Backup</Button><Button icon={RotateCcw}>Schedule Task</Button></div>
            </Panel>
            <Panel title="Server Type" className="max-xl:hidden">
              <div className="flex items-start gap-3 p-3"><div className="grid h-10 w-10 place-items-center rounded-[6px] border border-hairline bg-[#17130a]"><Box size={22} className="text-[#C7A95D]" /></div><div><div className="text-[12px] font-medium">Minecraft Java</div><div className="mt-1 text-[10px] text-muted">1.20.6</div></div></div>
              <div className="grid grid-cols-2 border-t border-hairline px-3 py-2 text-[11px]"><span className="text-muted">Software</span><span>Paper</span><span className="mt-2 text-muted">Java Version</span><span className="mt-2">21</span></div>
            </Panel>
          </section>

          <section className="mt-3 grid grid-cols-[1.5fr_.9fr] gap-3 max-md:grid-cols-1">
            <Panel title="Files" action={<span className="flex gap-2"><Button icon={Upload}>Upload</Button><Button>New</Button></span>}>
              <div className="flex h-8 items-center border-b border-hairline px-3 font-mono text-[10px] text-muted">/ home / container /</div>
              {[["plugins", true],["world",true],["server.properties",false]].map(([name,isFolder]) => (
                <div key={String(name)} className="grid h-8 grid-cols-[24px_1fr_80px_100px] items-center border-b border-hairline/60 px-3 text-[11px] last:border-b-0 hover:bg-raised"><input type="checkbox" aria-label={`Select ${name}`} /><span className="flex items-center gap-2">{isFolder ? <Folder size={13} /> : <Settings size={13} />}{name}</span><span className="text-muted">{isFolder ? "" : "4 KB"}</span><span className="text-muted">2 hours ago</span></div>
              ))}
            </Panel>
            <Panel title="Backups" action={<button className="text-[10px] text-accent">View all →</button>}>
              {[["Auto Backup", "2 hours ago", "4.2 MB"], ["Manual Backup", "1 day ago", "4.1 MB"]].map(([name,time,size]) => (
                <div key={name} className="flex h-12 items-center gap-3 border-b border-hairline/60 px-3 last:border-b-0"><Archive size={14} className="text-muted"/><div><div className="text-[11px]">{name}</div><div className="mt-0.5 text-[9px] text-muted">{time} · {size}</div></div><button className="ml-auto h-7 rounded-control border border-hairline px-2 text-[10px] hover:bg-raised">Restore</button></div>
              ))}
            </Panel>
          </section>
        </div>
      </main>
      <CommandPalette open={palette} close={() => setPalette(false)} />
    </div>
  );
}

function Panel({ title, action, status, children, className = "" }: { title: string; action?: React.ReactNode; status?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-panel border border-hairline bg-surface ${className}`}>
      <div className="flex h-10 items-center border-b border-hairline px-3"><h3 className="text-[11px] font-semibold">{title}</h3>{status && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-success"><span className="h-1.5 w-1.5 rounded-full bg-success"></span>{status}</span>}{action && <div className="ml-auto">{action}</div>}</div>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
