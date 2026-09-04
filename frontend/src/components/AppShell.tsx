import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../AppContext';
import { logout } from '../lib/auth';
import { Avatar } from './ui';
import { Icon, type IconName } from './Icon';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  badge?: number;
}

export function AppShell() {
  const { me, org, isAdmin, overdueCount } = useSession();
  const location = useLocation();

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
    { to: '/scan', label: 'Desk', short: 'Desk', icon: 'scan' },
    { to: '/loans', label: 'Loans', short: 'Loans', icon: 'loans', badge: overdueCount },
    { to: '/assets', label: 'Catalogue', short: 'Items', icon: 'assets' },
    { to: '/members', label: 'Members', short: 'People', icon: 'members' },
  ];

  const secondary: NavItem[] = [
    { to: '/reports', label: 'Reports', short: 'Reports', icon: 'reports' },
    { to: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
  ];

  const current = [...items, ...secondary].find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="loans" size={17} />
          </span>
          <span className="col">
            <span>{org.name}</span>
            <span className="brand-sub">ShelfKit</span>
          </span>
        </div>

        <nav>
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <div className="nav-group-label">Insights</div>
          {secondary.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <Avatar name={me.user.name || me.user.email || 'Staff'} />
          <div className="col grow">
            <span className="small strong truncate">{me.user.name || 'Staff'}</span>
            <span className="tiny muted">{isAdmin ? 'Administrator' : 'Desk staff'}</span>
          </div>
          <button className="btn ghost sm" onClick={logout} title="Sign out" aria-label="Sign out">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="brand-mark">
            <Icon name="loans" size={16} />
          </span>
          <div className="col grow">
            <strong className="truncate">{current?.label ?? org.name}</strong>
            <span className="tiny muted truncate">{org.name}</span>
          </div>
          <button className="btn ghost sm" onClick={logout} aria-label="Sign out">
            <Icon name="logout" size={16} />
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            <Icon name={item.icon} size={20} />
            {item.short}
          </NavLink>
        ))}
        <NavLink to="/reports">
          <Icon name="reports" size={20} />
          More
        </NavLink>
      </nav>
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} className="nav-link">
      <Icon name={item.icon} size={17} />
      {item.label}
      {item.badge ? <span className="count">{item.badge}</span> : null}
    </NavLink>
  );
}
