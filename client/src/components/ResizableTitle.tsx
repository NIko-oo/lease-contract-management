import React from 'react';
import { Resizable } from 'react-resizable';

interface ResizableTitleProps {
  onResize: (e: React.SyntheticEvent, data: { size: { width: number } }) => void;
  width: number;
  [key: string]: unknown;
}

const ResizableTitle: React.FC<ResizableTitleProps> = (props) => {
  const { onResize, width, onDoubleClickResize, ...restProps } = props as ResizableTitleProps & {
    onDoubleClickResize?: () => void;
  };

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onDoubleClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDoubleClickResize?.();
          }}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

export default ResizableTitle;
