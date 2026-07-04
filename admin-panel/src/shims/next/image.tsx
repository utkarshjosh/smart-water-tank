import * as React from 'react';

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
};

const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, fill, className, style, sizes, ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      style={
        fill
          ? {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...style,
            }
          : style
      }
      sizes={sizes}
      {...props}
    />
  );
});

export default Image;
