import { useNavigate } from 'react-router-dom';
import { SignOut, User as UserIcon } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';

export function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const name = profile?.name || user?.displayName || user?.email || 'Account';
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-label text-ink-1 transition-colors duration-instant ease-out hover:bg-line-strong"
        aria-label="Account menu"
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          initial
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-label text-ink-1">{name}</div>
          {profile?.email && <div className="truncate text-caption text-ink-3">{profile.email}</div>}
          {profile?.tenant_name && (
            <div className="mt-1 truncate text-caption text-ink-3">{profile.tenant_name}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/app/devices')}>
          <UserIcon size={16} className="mr-2" />
          My tanks
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          <SignOut size={16} className="mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
