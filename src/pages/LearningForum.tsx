import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Pin, 
  Lock, 
  ArrowUp, 
  ArrowDown,
  Eye,
  MessageCircle,
  ExternalLink,
  BookOpen,
  Shield,
  Wrench,
  Clock,
  Calendar,
  MoreVertical,
  Flag,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  display_order: number;
}

interface ForumDiscussion {
  id: string;
  category_id: string;
  title: string;
  content: string;
  author_id: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_moderated: boolean;
  view_count: number;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
  category?: ForumCategory;
  author?: {
    full_name: string | null;
    avatar_url?: string | null;
  } | null;
}

interface ForumPost {
  id: string;
  discussion_id: string;
  author_id: string;
  content: string;
  is_moderated: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
  parent_post_id?: string | null;
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_minutes: number;
  difficulty_level: string;
  external_url: string;
}

interface Vote {
  id: string;
  user_id: string;
  discussion_id?: string;
  post_id?: string;
  vote_type: 'up' | 'down';
}

const LearningForum = () => {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [discussions, setDiscussions] = useState<ForumDiscussion[]>([]);
  const [trainingModules, setTrainingModules] = useState<TrainingModule[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string | null; avatar_url?: string | null }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'votes'>('recent');
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [editingDiscussion, setEditingDiscussion] = useState<ForumDiscussion | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', category_id: '' });
  const [deletingDiscussion, setDeletingDiscussion] = useState<ForumDiscussion | null>(null);
  const [moderatingDiscussion, setModeratingDiscussion] = useState<ForumDiscussion | null>(null);

  // Replies / thread state
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});
  const [postsByDiscussion, setPostsByDiscussion] = useState<Record<string, ForumPost[]>>({});
  const [loadingPosts, setLoadingPosts] = useState<Record<string, boolean>>({});
  const [newReplyContent, setNewReplyContent] = useState<Record<string, string>>({});
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [deletingPost, setDeletingPost] = useState<ForumPost | null>(null);
  const [moderatingPost, setModeratingPost] = useState<ForumPost | null>(null);

  const [newDiscussion, setNewDiscussion] = useState({
    title: '',
    content: '',
    category_id: ''
  });

  const isAdmin = hasPermission('*');

  const getCategoryIcon = (iconName: string) => {
    const icons: Record<string, React.ComponentType<any>> = {
      MessageSquare,
      Shield,
      Wrench,
      BookOpen
    };
    return icons[iconName] || MessageSquare;
  };

  const fetchProfilesFor = async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter((id) => id && !profileMap[id])));
    if (missing.length === 0) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', missing);
    if (data) {
      setProfileMap((prev) => {
        const next = { ...prev };
        for (const p of data as any[]) {
          next[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        }
        return next;
      });
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('forum_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);
      
      const { data: discussionsData, error: discussionsError } = await supabase
        .from('forum_discussions')
        .select(`*, category:forum_categories(*)`)
        .order('is_pinned', { ascending: false })
        .order('last_activity_at', { ascending: false });
      if (discussionsError) throw discussionsError;
      const ds = (discussionsData as any) || [];
      setDiscussions(ds);

      // Pull profiles for authors + editors
      const ids = ds.flatMap((d: any) => [d.author_id, d.updated_by]).filter(Boolean);
      fetchProfilesFor(ids);
      
      const { data: modulesData, error: modulesError } = await supabase
        .from('training_modules')
        .select('*')
        .eq('is_active', true)
        .order('title');
      if (modulesError) throw modulesError;
      setTrainingModules(modulesData || []);
      
      if (user) {
        const { data: votesData, error: votesError } = await supabase
          .from('forum_votes')
          .select('*')
          .eq('user_id', user.id);
        if (votesError) throw votesError;
        setVotes((votesData as any) || []);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createDiscussion = async () => {
    if (!user || !newDiscussion.title.trim() || !newDiscussion.content.trim() || !newDiscussion.category_id) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('forum_discussions').insert({
        title: newDiscussion.title.trim(),
        content: newDiscussion.content.trim(),
        category_id: newDiscussion.category_id,
        author_id: user.id
      });
      if (error) throw error;
      toast({ title: 'Success', description: 'Discussion created successfully' });
      setShowNewDiscussion(false);
      setNewDiscussion({ title: '', content: '', category_id: '' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEditAttempt = (d: ForumDiscussion) => {
    if (d.is_locked || d.is_moderated) {
      toast({
        title: 'Editing unavailable',
        description: 'This discussion is locked or under moderation. Unmoderate it first to make changes.',
        variant: 'destructive',
      });
      return;
    }
    setEditingDiscussion(d);
    setEditForm({ title: d.title, content: d.content, category_id: d.category_id });
  };

  const saveEditDiscussion = async () => {
    if (!editingDiscussion) return;
    if (!editForm.title.trim() || !editForm.content.trim() || !editForm.category_id) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('forum_discussions')
        .update({
          title: editForm.title.trim(),
          content: editForm.content.trim(),
          category_id: editForm.category_id,
        })
        .eq('id', editingDiscussion.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Discussion updated successfully' });
      setEditingDiscussion(null);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const confirmDeleteDiscussion = async () => {
    if (!deletingDiscussion) return;
    try {
      const { error } = await supabase
        .from('forum_discussions')
        .delete()
        .eq('id', deletingDiscussion.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Discussion has been deleted' });
      setDeletingDiscussion(null);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const confirmModerateDiscussion = async () => {
    if (!moderatingDiscussion) return;
    const d = moderatingDiscussion;
    try {
      const newVal = !d.is_moderated;
      const { error } = await supabase
        .from('forum_discussions')
        .update({ is_moderated: newVal, is_locked: newVal })
        .eq('id', d.id);
      if (error) throw error;
      if (user) {
        await supabase.from('forum_moderation_logs').insert({
          moderator_id: user.id,
          target_type: 'discussion',
          target_id: d.id,
          action: newVal ? 'moderated' : 'unmoderated',
        });
      }
      toast({
        title: newVal ? 'Moderated' : 'Unmoderated',
        description: `Discussion has been ${newVal ? 'flagged and locked' : 'reopened'}.`,
      });
      setModeratingDiscussion(null);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // ---------- Replies ----------
  const toggleThread = async (discussionId: string) => {
    const willOpen = !expandedThreads[discussionId];
    setExpandedThreads((p) => ({ ...p, [discussionId]: willOpen }));
    if (willOpen && !postsByDiscussion[discussionId]) {
      await loadPosts(discussionId);
    }
  };

  const loadPosts = async (discussionId: string) => {
    setLoadingPosts((p) => ({ ...p, [discussionId]: true }));
    try {
      const { data, error } = await supabase
        .from('forum_posts')
        .select('*')
        .eq('discussion_id', discussionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const posts = (data as any) || [];
      setPostsByDiscussion((p) => ({ ...p, [discussionId]: posts }));
      const ids = posts.flatMap((x: any) => [x.author_id, x.updated_by]).filter(Boolean);
      fetchProfilesFor(ids);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingPosts((p) => ({ ...p, [discussionId]: false }));
    }
  };

  const submitReply = async (discussion: ForumDiscussion) => {
    if (!user) return;
    if (discussion.is_locked || discussion.is_moderated) {
      toast({ title: 'Replies disabled', description: 'This discussion is locked.', variant: 'destructive' });
      return;
    }
    const content = (newReplyContent[discussion.id] || '').trim();
    if (!content) {
      toast({ title: 'Empty reply', description: 'Please write something before posting.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('forum_posts').insert({
        discussion_id: discussion.id,
        author_id: user.id,
        content,
      });
      if (error) throw error;
      setNewReplyContent((p) => ({ ...p, [discussion.id]: '' }));
      await loadPosts(discussion.id);
      toast({ title: 'Reply posted' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEditPostAttempt = (post: ForumPost) => {
    if (post.is_locked || post.is_moderated) {
      toast({
        title: 'Editing unavailable',
        description: 'This reply is locked or hidden by moderation.',
        variant: 'destructive',
      });
      return;
    }
    if (post.author_id !== user?.id && !isAdmin) {
      toast({ title: 'Not allowed', description: 'You can only edit your own replies.', variant: 'destructive' });
      return;
    }
    setEditingPost(post);
    setEditPostContent(post.content);
  };

  const saveEditPost = async () => {
    if (!editingPost) return;
    if (!editPostContent.trim()) {
      toast({ title: 'Error', description: 'Reply cannot be empty.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('forum_posts')
        .update({ content: editPostContent.trim() })
        .eq('id', editingPost.id);
      if (error) throw error;
      toast({ title: 'Reply updated' });
      const did = editingPost.discussion_id;
      setEditingPost(null);
      await loadPosts(did);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const confirmDeletePost = async () => {
    if (!deletingPost) return;
    try {
      const { error } = await supabase.from('forum_posts').delete().eq('id', deletingPost.id);
      if (error) throw error;
      toast({ title: 'Reply deleted' });
      const did = deletingPost.discussion_id;
      setDeletingPost(null);
      await loadPosts(did);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const confirmModeratePost = async () => {
    if (!moderatingPost) return;
    const post = moderatingPost;
    try {
      const newVal = !post.is_moderated;
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_moderated: newVal, is_locked: newVal })
        .eq('id', post.id);
      if (error) throw error;
      if (user) {
        await supabase.from('forum_moderation_logs').insert({
          moderator_id: user.id,
          target_type: 'post',
          target_id: post.id,
          action: newVal ? 'moderated' : 'unmoderated',
        });
      }
      toast({
        title: newVal ? 'Reply hidden' : 'Reply restored',
        description: newVal ? 'The reply is now hidden and locked.' : 'The reply is visible again.',
      });
      const did = post.discussion_id;
      setModeratingPost(null);
      await loadPosts(did);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // ---------- Voting ----------
  const handleVote = async (discussionId: string, voteType: 'up' | 'down') => {
    if (!user) return;
    try {
      const existingVote = votes.find(v => v.discussion_id === discussionId);
      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          const { error } = await supabase.from('forum_votes').delete().eq('id', existingVote.id);
          if (error) throw error;
          setVotes(votes.filter(v => v.id !== existingVote.id));
        } else {
          const { error } = await supabase.from('forum_votes').update({ vote_type: voteType }).eq('id', existingVote.id);
          if (error) throw error;
          setVotes(votes.map(v => v.id === existingVote.id ? { ...v, vote_type: voteType } : v));
        }
      } else {
        const { data, error } = await supabase
          .from('forum_votes')
          .insert({ user_id: user.id, discussion_id: discussionId, vote_type: voteType })
          .select().single();
        if (error) throw error;
        setVotes([...votes, data as any]);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getVoteCount = (discussionId: string, type: 'up' | 'down') =>
    votes.filter(v => v.discussion_id === discussionId && v.vote_type === type).length;
  const getUserVote = (discussionId: string) =>
    votes.find(v => v.discussion_id === discussionId && v.user_id === user?.id);

  const filteredDiscussions = discussions.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         d.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || d.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedDiscussions = [...filteredDiscussions].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    switch (sortBy) {
      case 'popular': return b.view_count - a.view_count;
      case 'votes': {
        const aVotes = getVoteCount(a.id, 'up') - getVoteCount(a.id, 'down');
        const bVotes = getVoteCount(b.id, 'up') - getVoteCount(b.id, 'down');
        return bVotes - aVotes;
      }
      default: return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    }
  });

  const nameOf = (id?: string | null) => (id && profileMap[id]?.full_name) || 'Unknown user';
  const avatarOf = (id?: string | null) => (id && profileMap[id]?.avatar_url) || undefined;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded"></div>
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded"></div>
                <div className="h-4 w-1/2 bg-muted animate-pulse rounded"></div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Discussion & Learning Forum</h1>
          <p className="text-muted-foreground">
            Connect with the community and access CSDD training resources
          </p>
        </div>
        <Dialog open={showNewDiscussion} onOpenChange={setShowNewDiscussion}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Discussion</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Start New Discussion</DialogTitle>
              <DialogDescription>
                Share your thoughts, ask questions, or start a conversation with the community.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={newDiscussion.category_id} onValueChange={(value) => 
                  setNewDiscussion(prev => ({ ...prev, category_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={newDiscussion.title}
                  onChange={(e) => setNewDiscussion(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter discussion title" />
              </div>
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea id="content" value={newDiscussion.content}
                  onChange={(e) => setNewDiscussion(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Share your thoughts..." rows={4} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDiscussion(false)}>Cancel</Button>
              <Button onClick={createDiscussion}>Create Discussion</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="discussions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="discussions"><MessageSquare className="h-4 w-4 mr-2" />Discussions</TabsTrigger>
          <TabsTrigger value="training"><BookOpen className="h-4 w-4 mr-2" />CSDD Training</TabsTrigger>
        </TabsList>

        <TabsContent value="discussions" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.icon);
              const categoryDiscussions = discussions.filter(d => d.category_id === category.id);
              return (
                <Card key={category.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedCategory(category.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {categoryDiscussions.length} discussions
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{category.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search discussions..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent Activity</SelectItem>
                <SelectItem value="popular">Most Viewed</SelectItem>
                <SelectItem value="votes">Highest Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {sortedDiscussions.map((discussion) => {
              const userVote = getUserVote(discussion.id);
              const upVotes = getVoteCount(discussion.id, 'up');
              const downVotes = getVoteCount(discussion.id, 'down');
              const netVotes = upVotes - downVotes;
              const canActOnDiscussion = isAdmin || discussion.author_id === user?.id;
              const wasEdited =
                discussion.updated_at &&
                discussion.created_at &&
                new Date(discussion.updated_at).getTime() - new Date(discussion.created_at).getTime() > 1500;
              const isThreadOpen = !!expandedThreads[discussion.id];
              const posts = postsByDiscussion[discussion.id] || [];
              const lockedOrModerated = discussion.is_locked || discussion.is_moderated;

              return (
                <Card key={discussion.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center space-y-1 min-w-[60px]">
                        <Button variant={userVote?.vote_type === 'up' ? 'default' : 'ghost'} size="sm"
                          onClick={() => handleVote(discussion.id, 'up')} className="h-8 w-8 p-0">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-medium">{netVotes}</span>
                        <Button variant={userVote?.vote_type === 'down' ? 'default' : 'ghost'} size="sm"
                          onClick={() => handleVote(discussion.id, 'down')} className="h-8 w-8 p-0">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {discussion.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                              {discussion.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                              <Badge variant="secondary">{discussion.category?.name}</Badge>
                              {discussion.is_moderated && <Badge variant="destructive">Moderated</Badge>}
                            </div>
                            
                            <h3 className="text-lg font-semibold mb-2">{discussion.title}</h3>
                            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{discussion.content}</p>
                            
                            <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                              <div className="flex items-center space-x-4 flex-wrap">
                                <div className="flex items-center space-x-1">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={avatarOf(discussion.author_id)} />
                                    <AvatarFallback>{nameOf(discussion.author_id).charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span>{nameOf(discussion.author_id)}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{formatDistanceToNow(new Date(discussion.created_at), { addSuffix: true })}</span>
                                </div>
                                {wasEdited && (
                                  <div className="flex items-center space-x-1 italic">
                                    <Edit className="h-3 w-3" />
                                    <span>
                                      Last updated {formatDistanceToNow(new Date(discussion.updated_at), { addSuffix: true })}
                                      {discussion.updated_by ? ` by ${nameOf(discussion.updated_by)}` : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-1">
                                  <Eye className="h-3 w-3" /><span>{discussion.view_count}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <MessageCircle className="h-3 w-3" /><span>{discussion.reply_count}</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <Button variant="ghost" size="sm" onClick={() => toggleThread(discussion.id)}>
                                {isThreadOpen ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                                {isThreadOpen ? 'Hide replies' : 'View replies'}
                              </Button>
                            </div>
                          </div>

                          {canActOnDiscussion && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={lockedOrModerated}
                                  onClick={(e) => {
                                    if (lockedOrModerated) {
                                      e.preventDefault();
                                      toast({
                                        title: 'Editing unavailable',
                                        description: 'Discussion is locked or moderated.',
                                        variant: 'destructive',
                                      });
                                      return;
                                    }
                                    handleEditAttempt(discussion);
                                  }}
                                >
                                  <Edit className="h-4 w-4 mr-2" />Edit
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuItem onClick={() => setModeratingDiscussion(discussion)}>
                                      <Flag className="h-4 w-4 mr-2" />
                                      {discussion.is_moderated ? 'Unmoderate' : 'Moderate'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive"
                                      onClick={() => setDeletingDiscussion(discussion)}>
                                      <Trash2 className="h-4 w-4 mr-2" />Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        {/* Replies thread */}
                        {isThreadOpen && (
                          <div className="mt-4 border-t pt-4 space-y-3">
                            {loadingPosts[discussion.id] ? (
                              <div className="text-sm text-muted-foreground">Loading replies…</div>
                            ) : posts.length === 0 ? (
                              <div className="text-sm text-muted-foreground italic">No replies yet.</div>
                            ) : (
                              posts.map((post) => {
                                const canEditPost = isAdmin || post.author_id === user?.id;
                                const postEdited = post.updated_at && post.created_at &&
                                  new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1500;
                                const postLocked = post.is_locked || post.is_moderated;
                                return (
                                  <div key={post.id} className={`rounded-md border p-3 ${postLocked ? 'bg-muted/50' : ''}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
                                          <Avatar className="h-5 w-5">
                                            <AvatarImage src={avatarOf(post.author_id)} />
                                            <AvatarFallback>{nameOf(post.author_id).charAt(0)}</AvatarFallback>
                                          </Avatar>
                                          <span className="font-medium text-foreground">{nameOf(post.author_id)}</span>
                                          <span>·</span>
                                          <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                                          {post.is_moderated && <Badge variant="destructive" className="ml-1">Hidden</Badge>}
                                          {post.is_locked && !post.is_moderated && <Lock className="h-3 w-3" />}
                                        </div>
                                        {post.is_moderated && !isAdmin ? (
                                          <p className="text-sm italic text-muted-foreground">
                                            This reply has been hidden by a moderator.
                                          </p>
                                        ) : (
                                          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                                        )}
                                        {postEdited && (
                                          <p className="text-xs italic text-muted-foreground mt-1">
                                            Edited {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true })}
                                            {post.updated_by ? ` by ${nameOf(post.updated_by)}` : ''}
                                          </p>
                                        )}
                                      </div>
                                      {canEditPost && (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                              disabled={postLocked}
                                              onClick={(e) => {
                                                if (postLocked) {
                                                  e.preventDefault();
                                                  toast({
                                                    title: 'Editing unavailable',
                                                    description: 'This reply is locked or hidden.',
                                                    variant: 'destructive',
                                                  });
                                                  return;
                                                }
                                                handleEditPostAttempt(post);
                                              }}
                                            >
                                              <Edit className="h-4 w-4 mr-2" />Edit
                                            </DropdownMenuItem>
                                            {isAdmin && (
                                              <>
                                                <DropdownMenuItem onClick={() => setModeratingPost(post)}>
                                                  {post.is_moderated ? (
                                                    <><Eye className="h-4 w-4 mr-2" />Unhide</>
                                                  ) : (
                                                    <><EyeOff className="h-4 w-4 mr-2" />Hide / Lock</>
                                                  )}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive"
                                                  onClick={() => setDeletingPost(post)}>
                                                  <Trash2 className="h-4 w-4 mr-2" />Delete
                                                </DropdownMenuItem>
                                              </>
                                            )}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}

                            {/* Reply composer */}
                            {lockedOrModerated ? (
                              <div className="text-xs text-muted-foreground italic">
                                Replies are disabled — this discussion is locked.
                              </div>
                            ) : (
                              <div className="flex gap-2 items-start">
                                <Textarea
                                  rows={2}
                                  placeholder="Write a reply…"
                                  value={newReplyContent[discussion.id] || ''}
                                  onChange={(e) =>
                                    setNewReplyContent((p) => ({ ...p, [discussion.id]: e.target.value }))
                                  }
                                />
                                <Button size="sm" onClick={() => submitReply(discussion)}>
                                  <Send className="h-4 w-4 mr-1" />Reply
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {sortedDiscussions.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No discussions found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm || selectedCategory !== 'all' 
                      ? 'Try adjusting your search or filters'
                      : 'Be the first to start a discussion!'}
                  </p>
                  <Button onClick={() => setShowNewDiscussion(true)}>
                    <Plus className="h-4 w-4 mr-2" />Start Discussion
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="training" className="space-y-6">
          <div className="grid gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">CSDD Training Modules</h2>
                <p className="text-muted-foreground">
                  Access comprehensive risk management training through our CSDD portal integration
                </p>
              </div>
              <Button asChild>
                <Link to="https://csdd.portal.com" target="_blank">
                  <ExternalLink className="h-4 w-4 mr-2" />Visit CSDD Portal
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trainingModules.map((module) => (
                <Card key={module.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{module.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">{module.category}</Badge>
                          <Badge variant="secondary">{module.difficulty_level}</Badge>
                        </div>
                      </div>
                      <BookOpen className="h-6 w-6 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" /><span>{module.duration_minutes} minutes</span>
                      </div>
                    </div>
                    <Button asChild className="w-full">
                      <Link to={module.external_url} target="_blank">
                        <ExternalLink className="h-4 w-4 mr-2" />Access Module
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {trainingModules.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No training modules available</h3>
                  <p className="text-muted-foreground">
                    Training modules will appear here once they are configured in the CSDD portal.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Discussion Dialog */}
      <Dialog open={!!editingDiscussion} onOpenChange={(o) => !o && setEditingDiscussion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Discussion</DialogTitle>
            <DialogDescription>Update the discussion details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={editForm.category_id}
                onValueChange={(v) => setEditForm((p) => ({ ...p, category_id: v }))}>
                <SelectTrigger id="edit-category"><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea id="edit-content" rows={6} value={editForm.content}
                onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDiscussion(null)}>Cancel</Button>
            <Button onClick={saveEditDiscussion}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderate Discussion Confirmation */}
      <Dialog open={!!moderatingDiscussion} onOpenChange={(o) => !o && setModeratingDiscussion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {moderatingDiscussion?.is_moderated ? 'Unmoderate discussion?' : 'Moderate discussion?'}
            </DialogTitle>
            <DialogDescription>
              {moderatingDiscussion?.is_moderated ? (
                <>This will <span className="font-medium">restore</span> "{moderatingDiscussion?.title}" and unlock it for replies and edits.</>
              ) : (
                <>This will <span className="font-medium">flag and lock</span> "{moderatingDiscussion?.title}". Authors will not be able to edit it or post new replies until it is unmoderated.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeratingDiscussion(null)}>Cancel</Button>
            <Button
              variant={moderatingDiscussion?.is_moderated ? 'default' : 'destructive'}
              onClick={confirmModerateDiscussion}
            >
              {moderatingDiscussion?.is_moderated ? 'Unmoderate' : 'Moderate & Lock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Discussion Confirmation */}
      <Dialog open={!!deletingDiscussion} onOpenChange={(o) => !o && setDeletingDiscussion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete discussion?</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-medium">"{deletingDiscussion?.title}"</span> and all of its replies. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingDiscussion(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteDiscussion}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(o) => !o && setEditingPost(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit reply</DialogTitle>
            <DialogDescription>Make your changes and save.</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={editPostContent} onChange={(e) => setEditPostContent(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
            <Button onClick={saveEditPost}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderate Post Confirmation */}
      <Dialog open={!!moderatingPost} onOpenChange={(o) => !o && setModeratingPost(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {moderatingPost?.is_moderated ? 'Restore reply?' : 'Hide and lock reply?'}
            </DialogTitle>
            <DialogDescription>
              {moderatingPost?.is_moderated
                ? 'The reply will become visible to everyone again and the author will regain edit access.'
                : 'The reply will be hidden from non-admin users and locked from further edits by its author.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeratingPost(null)}>Cancel</Button>
            <Button
              variant={moderatingPost?.is_moderated ? 'default' : 'destructive'}
              onClick={confirmModeratePost}
            >
              {moderatingPost?.is_moderated ? 'Restore' : 'Hide & Lock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Post Confirmation */}
      <Dialog open={!!deletingPost} onOpenChange={(o) => !o && setDeletingPost(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete reply?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPost(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeletePost}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LearningForum;
