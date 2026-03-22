# findpaper
Academic paper search and screening platform with download functionality for convenient access to research materials.
![Uploading image.png…]()

```markdown
# projects

This is a full-stack application project built with [Next.js 16](https://nextjs.org) + [shadcn/ui](https://ui.shadcn.com), created by the Coze Programming CLI.

## Quick Start

### Start the Development Server

```bash
coze dev
```

Once started, open [http://localhost:5000](http://localhost:5000) in your browser to view the app.

The development server supports hot reloading—pages will automatically refresh when you modify the code.

### Build for Production

```bash
coze build
```

### Start the Production Server

```bash
coze start
```

## Project Structure

```
src/
├── app/                      # Next.js App Router directory
│   ├── layout.tsx           # Root layout component
│   ├── page.tsx             # Home page
│   ├── globals.css          # Global styles (includes shadcn theme variables)
│   └── [route]/             # Other route pages
├── components/              # React components directory
│   └── ui/                  # shadcn/ui base components (use these first)
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── lib/                     # Utility functions
│   └── utils.ts            # Utility functions like cn()
└── hooks/                   # Custom React Hooks (optional)

server/
├── index.ts                 # Custom server entry point
├── tsconfig.json           # Server TypeScript configuration
└── dist/                    # Compiled output directory (auto-generated)
```

## Core Development Guidelines

### 1. Component Development

**Prefer shadcn/ui Base Components**

The project comes with a complete set of shadcn/ui components, located in `src/components/ui/`. Always prioritize using these as building blocks:

```tsx
// ✅ Recommended: Use shadcn base components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function MyComponent() {
  return (
    <Card>
      <CardHeader>Title</CardHeader>
      <CardContent>
        <Input placeholder="Enter content" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

**Available shadcn Components**

- Forms: `button`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `slider`
- Layout: `card`, `separator`, `tabs`, `accordion`, `collapsible`, `scroll-area`
- Feedback: `alert`, `alert-dialog`, `dialog`, `toast`, `sonner`, `progress`
- Navigation: `dropdown-menu`, `menubar`, `navigation-menu`, `context-menu`
- Data Display: `table`, `avatar`, `badge`, `hover-card`, `tooltip`, `popover`
- Others: `calendar`, `command`, `carousel`, `resizable`, `sidebar`

Refer to the specific component implementations in `src/components/ui/` for details.

### 2. Routing

Next.js uses file-system routing. Add routes by creating folders in `src/app/`:

```bash
# Create a /about route
src/app/about/page.tsx

# Create a dynamic route /posts/[id]
src/app/posts/[id]/page.tsx

# Create a route group (doesn't affect URL)
src/app/(marketing)/about/page.tsx

# Create an API route
src/app/api/users/route.ts
```

**Page Component Example**

```tsx
// src/app/about/page.tsx
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'About Us',
  description: 'About page description',
};

export default function AboutPage() {
  return (
    <div>
      <h1>About Us</h1>
      <Button>Learn More</Button>
    </div>
  );
}
```

**Dynamic Route Example**

```tsx
// src/app/posts/[id]/page.tsx
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <div>Post ID: {id}</div>;
}
```

**API Route Example**

```tsx
// src/app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

### 3. Dependency Management

**You must use pnpm to manage dependencies**

```bash
# ✅ Install dependencies
pnpm install

# ✅ Add a new dependency
pnpm add package-name

# ✅ Add a dev dependency
pnpm add -D package-name

# ❌ Do not use npm or yarn
# npm install  # wrong!
# yarn add     # wrong!
```

The project includes a `preinstall` script that will error if you use other package managers.

### 4. Styling

**Use Tailwind CSS v4**

This project uses Tailwind CSS v4 for styling, with shadcn theme variables already configured.

```tsx
// Use Tailwind classes
<div className="flex items-center gap-4 p-4 rounded-lg bg-background">
  <Button className="bg-primary text-primary-foreground">
    Primary Button
  </Button>
</div>

// Use cn() utility to merge classes
import { cn } from '@/lib/utils';

<div className={cn(
  "base-class",
  condition && "conditional-class",
  className
)}>
  Content
</div>
```

**Theme Variables**

Theme variables are defined in `src/app/globals.css`, supporting both light and dark modes:

- `--background`, `--foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`

### 5. Form Development

We recommend using `react-hook-form` + `zod` for form development:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const formSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
});

export default function MyForm() {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', email: '' },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('username')} />
      <Input {...form.register('email')} />
      <Button type="submit">Submit</Button>
    </form>
  );
}
```

### 6. Data Fetching

**Server Components (Recommended)**

```tsx
// src/app/posts/page.tsx
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    cache: 'no-store', // or 'force-cache'
  });
  return res.json();
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <div>
      {posts.map(post => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  );
}
```

**Client Components**

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function ClientComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(setData);
  }, []);

  return <div>{JSON.stringify(data)}</div>;
}
```

## Common Development Scenarios

### Add a New Page

1. Create a folder and `page.tsx` in `src/app/`
2. Build the UI using shadcn components
3. Optionally add `layout.tsx` and `loading.tsx`

### Create a Business Component

1. Create a component file in `src/components/` (not in ui/)
2. Combine base components from `src/components/ui/`
3. Define Props types using TypeScript

### Add Global State

We recommend using React Context or Zustand:

```tsx
// src/lib/store.ts
import { create } from 'zustand';

interface Store {
  count: number;
  increment: () => void;
}

export const useStore = create<Store>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### Integrate a Database

We recommend using Prisma or Drizzle ORM, configured in `src/lib/db.ts`.

## Tech Stack

- **Framework**: Next.js 16.1.1 (App Router)
- **UI Components**: shadcn/ui (based on Radix UI)
- **Styling**: Tailwind CSS v4
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Fonts**: Geist Sans & Geist Mono
- **Package Manager**: pnpm 9+
- **TypeScript**: 5.x

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)

## Important Notes

1. **You must use pnpm** as the package manager
2. **Prefer shadcn/ui components** over building basic components from scratch
3. **Follow Next.js App Router conventions**, correctly distinguishing server/client components
4. **Use TypeScript** for type-safe development
5. **Use the `@/` path alias** for imports (already configured)

