"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Globe, Loader2, Copy, Check, Rocket } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getProject, updateProjectFiles, updateProjectName, publishProject, deployToArsenal, FreeCodeProject, FileNode } from "@/lib/freecode-helpers";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";
import FreeCodeIDE from "@/components/freecode/FreeCodeIDE";

export default function FreeCodeIDEPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useUser();
  const { toast } = useToast();
  const supabase = createClient();

  const projectId = params.projectId as string;

  const [project, setProject] = useState<FreeCodeProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'idle'>('idle');
  const [projectName, setProjectName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeployedToArsenal, setIsDeployedToArsenal] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      if (!projectId) return;
      try {
        const data = await getProject(supabase, projectId);

        // Ensure only owner can access
        if (data.user_id !== user?.id) {
          router.push('/freecode');
          return;
        }

        // Legacy migration: if files is not a FileNode array (old Sandpack format), reset to defaults
        if (!Array.isArray(data.files) || data.files.length === 0) {
          (data as any).files = [];
        }

        setProject(data);
        setProjectName(data.name);

        // Check if already deployed to arsenal
        if (profile?.username) {
          const { data: arsenalEntry } = await supabase
            .from("user_projects")
            .select("id")
            .eq("user_id", user?.id)
            .ilike("website_url", `%/${profile.username}/${data.slug}`)
            .maybeSingle();
          setIsDeployedToArsenal(!!arsenalEntry);
        }
      } catch (err: any) {
        toast("Failed to load project: " + err.message, "error");
        router.push('/freecode');
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [projectId, user]);

  const handleFilesChange = useCallback((files: FileNode[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await updateProjectFiles(supabase, projectId, files);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err: any) {
        toast("Failed to auto-save: " + err.message, "error");
        setSaveStatus('idle');
      }
    }, 1500);
  }, [projectId, supabase, toast]);

  const handleNameSave = async () => {
    setIsEditingName(false);
    if (projectName.trim() === project?.name || !projectName.trim()) {
      setProjectName(project?.name || "");
      return;
    }
    try {
      setSaveStatus('saving');
      await updateProjectName(supabase, projectId, projectName.trim());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      toast("Failed to rename: " + err.message, "error");
      setProjectName(project?.name || "");
      setSaveStatus('idle');
    }
  };

  const handlePublishToggle = async () => {
    if (!project) return;
    setIsPublishing(true);
    try {
      const newState = !project.is_published;
      await publishProject(supabase, projectId, newState);
      setProject({ ...project, is_published: newState });
      toast(newState ? "Project published successfully!" : "Project unpublished.", "success");
    } catch (err: any) {
      toast("Failed to toggle publish status: " + err.message, "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = () => {
    if (!project || !profile?.username) return;
    const url = `${window.location.origin}/${profile.username}/${project.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast("Link copied to clipboard!", "success");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDeployToArsenal = async () => {
    if (!project || !user || !profile?.username) return;
    setIsDeploying(true);
    try {
      await deployToArsenal(supabase, projectId, user.id, profile.username);
      toast("Deployed to your Arsenal!", "success");
      setIsDeployedToArsenal(true);
      if (!project.is_published) {
        setProject({ ...project, is_published: true });
      }
    } catch (err: any) {
      toast("Failed to deploy to Arsenal: " + err.message, "error");
    } finally {
      setIsDeploying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-lime-500" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="h-[var(--app-h)] w-full bg-[#FDFCF8] flex flex-col text-black overflow-hidden border-l-2 border-zinc-200">
      {/* Top Header */}
      <header className="h-14 border-b-2 border-zinc-200 bg-white/80 backdrop-blur flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/freecode')}
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500 hover:text-black"
          >
            <ArrowLeft size={18} />
          </button>

          {isEditingName ? (
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
              autoFocus
              className="bg-zinc-100 text-black px-3 py-1 rounded-md outline-none border-2 border-black font-black"
            />
          ) : (
            <h1
              onClick={() => setIsEditingName(true)}
              className="font-black text-lg cursor-pointer hover:text-lime-600 transition-colors tracking-tight"
            >
              {projectName}
            </h1>
          )}

          <div className="flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 ml-4 text-zinc-600">
            {saveStatus === 'saving' && <><Loader2 size={12} className="animate-spin text-lime-500" /> Saving...</>}
            {saveStatus === 'saved' && <><Check size={12} className="text-green-600" /> Saved</>}
            {saveStatus === 'idle' && <><Save size={12} className="text-zinc-500" /> Auto-save</>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {project.is_published && (
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors text-black border border-zinc-200"
            >
              {copiedLink ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              Copy Link
            </button>
          )}

          <button
            onClick={handlePublishToggle}
            disabled={isPublishing}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 font-bold text-sm transition-all border-2",
              project.is_published
                ? "bg-white text-green-600 border-green-600 rounded-xl hover:bg-green-50"
                : "bg-lime-400 text-black border-black rounded-xl hover:bg-lime-500 hover:-translate-y-0.5 shadow-[2px_2px_0_0_#000] hover:shadow-[4px_4px_0_0_#000] active:translate-y-0 active:shadow-none"
            )}
          >
            {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            {project.is_published ? "Published" : "Publish"}
          </button>

          {isDeployedToArsenal ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl bg-lime-50 text-lime-700 border-2 border-lime-300">
              <Check size={14} />
              In Arsenal
            </div>
          ) : (
            <button
              onClick={handleDeployToArsenal}
              disabled={isDeploying}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl bg-zinc-900 text-white hover:bg-black transition-colors border-2 border-transparent hover:border-lime-400 hover:-translate-y-0.5 shadow-sm active:translate-y-0"
            >
              {isDeploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Deploy to Arsenal
            </button>
          )}
        </div>
      </header>

      {/* IDE Body */}
      <div className="flex-1 overflow-hidden">
        <FreeCodeIDE project={project} onFilesChange={handleFilesChange} />
      </div>
    </div>
  );
}
