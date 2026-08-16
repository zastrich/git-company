import { prisma } from "../../../lib/db/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  TerminalSquare, 
  Settings,
  ArrowLeft,
  MessageSquare,
  Server
} from "lucide-react";

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
  });

  if (!company) {
    notFound();
  }

  const navItems = [
    { name: "Overview", href: `/dashboard/${company.slug}`, icon: LayoutDashboard },
    { name: "Agentes", href: `/dashboard/${company.slug}/agents`, icon: Users },
    { name: "Chat", href: `/dashboard/${company.slug}/chat`, icon: MessageSquare },
    { name: "Providers", href: `/dashboard/${company.slug}/providers`, icon: Server },
    { name: "Scheduler", href: `/dashboard/${company.slug}/scheduler`, icon: Activity },
    { name: "Auditoria", href: `/dashboard/${company.slug}/logs`, icon: TerminalSquare },
  ];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="p-6">
          <Link href="/" className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors mb-6 group">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Voltar
          </Link>
          <h2 className="text-xl font-bold tracking-tight text-white truncate" title={company.name}>
            {company.name}
          </h2>
          <p className="text-xs text-zinc-500 mt-1 truncate">
            {company.githubOwner}/{company.repoName}
          </p>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => (
            <Link key={item.name} href={item.href}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer">
                <item.icon className="w-5 h-5 text-zinc-500" />
                {item.name}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-zinc-800">
          <Link href={`/dashboard/${company.slug}/settings`}>
            <div className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer">
              <Settings className="w-5 h-5 text-zinc-500" />
              Configurações
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 md:p-12 max-w-6xl mx-auto">
          {props.children}
        </div>
      </main>
    </div>
  );
}
