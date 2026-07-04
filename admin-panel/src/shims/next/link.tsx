import * as React from 'react';
import { Link as RouterLink } from 'react-router-dom';

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

type LinkProps = AnchorProps & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
};

const isExternalHref = (href: string) =>
  href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:');

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, children, ...props },
  ref,
) {
  if (isExternalHref(href)) {
    return (
      <a href={href} ref={ref} {...props}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={href} replace={replace} ref={ref} {...props}>
      {children}
    </RouterLink>
  );
});

export default Link;
