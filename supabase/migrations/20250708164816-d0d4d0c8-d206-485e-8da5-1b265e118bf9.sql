-- Create forum categories table
CREATE TABLE public.forum_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum discussions table
CREATE TABLE public.forum_discussions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.forum_categories(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  is_moderated BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum posts table (replies)
CREATE TABLE public.forum_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE NOT NULL,
  parent_post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID NOT NULL,
  is_moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create forum votes table
CREATE TABLE public.forum_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  discussion_id UUID REFERENCES public.forum_discussions(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('up', 'down')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, discussion_id),
  UNIQUE(user_id, post_id),
  CHECK ((discussion_id IS NOT NULL AND post_id IS NULL) OR (discussion_id IS NULL AND post_id IS NOT NULL))
);

-- Create forum moderation logs table
CREATE TABLE public.forum_moderation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  moderator_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('discussion', 'post', 'user')) NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training modules table for CSDD integration
CREATE TABLE public.training_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  csdd_module_id TEXT UNIQUE,
  category TEXT,
  duration_minutes INTEGER,
  difficulty_level TEXT CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
  external_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default forum categories
INSERT INTO public.forum_categories (name, description, icon, display_order) VALUES
('General', 'General risk management discussions and questions', 'MessageSquare', 1),
('Compliance', 'Regulatory compliance and audit discussions', 'Shield', 2),
('Tools', 'Risk management tools and software discussions', 'Wrench', 3),
('Frameworks', 'Risk frameworks and methodologies', 'BookOpen', 4);

-- Insert sample training modules
INSERT INTO public.training_modules (title, description, csdd_module_id, category, duration_minutes, difficulty_level, external_url) VALUES
('Introduction to ISO 31000', 'Comprehensive overview of ISO 31000 risk management framework', 'CSDD-RM-001', 'Frameworks', 45, 'Beginner', 'https://csdd.portal.com/modules/iso31000-intro'),
('Advanced Risk Assessment Techniques', 'Deep dive into quantitative risk assessment methods', 'CSDD-RM-002', 'Tools', 90, 'Advanced', 'https://csdd.portal.com/modules/advanced-assessment'),
('Regulatory Compliance Updates', 'Latest updates in financial services compliance', 'CSDD-COMP-001', 'Compliance', 30, 'Intermediate', 'https://csdd.portal.com/modules/compliance-updates');

-- Enable Row Level Security
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for forum_categories (readable by all authenticated users)
CREATE POLICY "Categories are viewable by all authenticated users" 
ON public.forum_categories 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage categories" 
ON public.forum_categories 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_discussions
CREATE POLICY "Discussions are viewable by all authenticated users" 
ON public.forum_discussions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can create discussions" 
ON public.forum_discussions 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own discussions" 
ON public.forum_discussions 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = author_id);

CREATE POLICY "Admins can manage all discussions" 
ON public.forum_discussions 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_posts
CREATE POLICY "Posts are viewable by all authenticated users" 
ON public.forum_posts 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can create posts" 
ON public.forum_posts 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own posts" 
ON public.forum_posts 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = author_id);

CREATE POLICY "Admins can manage all posts" 
ON public.forum_posts 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create RLS policies for forum_votes
CREATE POLICY "Users can view all votes" 
ON public.forum_votes 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users can manage their own votes" 
ON public.forum_votes 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- Create RLS policies for forum_moderation_logs
CREATE POLICY "Moderation logs viewable by admins only" 
ON public.forum_moderation_logs 
FOR SELECT 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

CREATE POLICY "Admins can create moderation logs" 
ON public.forum_moderation_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
) AND auth.uid() = moderator_id);

-- Create RLS policies for training_modules
CREATE POLICY "Training modules are viewable by all authenticated users" 
ON public.training_modules 
FOR SELECT 
TO authenticated 
USING (is_active = true);

CREATE POLICY "Admins can manage training modules" 
ON public.training_modules 
FOR ALL 
TO authenticated 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'ADMIN'
));

-- Create indexes for better performance
CREATE INDEX idx_forum_discussions_category_id ON public.forum_discussions(category_id);
CREATE INDEX idx_forum_discussions_author_id ON public.forum_discussions(author_id);
CREATE INDEX idx_forum_discussions_last_activity ON public.forum_discussions(last_activity_at DESC);
CREATE INDEX idx_forum_posts_discussion_id ON public.forum_posts(discussion_id);
CREATE INDEX idx_forum_posts_parent_post_id ON public.forum_posts(parent_post_id);
CREATE INDEX idx_forum_posts_author_id ON public.forum_posts(author_id);
CREATE INDEX idx_forum_votes_user_discussion ON public.forum_votes(user_id, discussion_id);
CREATE INDEX idx_forum_votes_user_post ON public.forum_votes(user_id, post_id);
CREATE INDEX idx_training_modules_category ON public.training_modules(category);
CREATE INDEX idx_training_modules_csdd_id ON public.training_modules(csdd_module_id);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_forum_categories_updated_at
BEFORE UPDATE ON public.forum_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_discussions_updated_at
BEFORE UPDATE ON public.forum_discussions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_posts_updated_at
BEFORE UPDATE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_modules_updated_at
BEFORE UPDATE ON public.training_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create functions to update discussion stats
CREATE OR REPLACE FUNCTION public.update_discussion_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_discussions
    SET reply_count = reply_count + 1,
        last_activity_at = now()
    WHERE id = NEW.discussion_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_discussions
    SET reply_count = reply_count - 1,
        last_activity_at = now()
    WHERE id = OLD.discussion_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update discussion stats
CREATE TRIGGER update_discussion_reply_count
AFTER INSERT OR DELETE ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_discussion_stats();

-- Create function to update view count
CREATE OR REPLACE FUNCTION public.increment_discussion_views()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.forum_discussions
  SET view_count = view_count + 1
  WHERE id = NEW.discussion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;