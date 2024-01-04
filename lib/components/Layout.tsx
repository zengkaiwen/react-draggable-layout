import * as React from 'react';
import type { IBoxPosition, ILayoutData, ISize, IWidget, IWidgetPosition } from '../types';
import styled from 'styled-components';
import { IWidgetProps } from './Widget';
import useSize from '../hooks/useSize';
import Placeholder from './Placeholder';
import { GridLayoutEngine } from '../engine';

const Wrapper = styled.div`
  position: relative;
`;

export interface ILayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  col: number;
  widgets: IWidget[];
  children: React.ReactNode;
  draggableHandle?: string;
  resizeableHandle?: string;
  /** [x, y] 方向上每个 widget 的边距，px 数值 */
  gap?: [number, number];
  /** 像素值传字符串例如：40px，传 number 表示为几个 col 宽度。默认为 colWidth 像素宽度 */
  rowHeight?: string | number;
  float?: boolean;
  initCompact?: boolean;
  onSizeChange?: (size: ISize) => void;
}

const Layout: React.FC<ILayoutProps> = (props) => {
  const {
    col,
    rowHeight: propsRowHieght,
    gap,
    widgets,
    children,
    draggableHandle,
    resizeableHandle,
    float,
    initCompact,
    onSizeChange,
    ...ret
  } = props;
  const layoutRef = React.useRef<HTMLDivElement>(null);
  const [layoutWidgets, setLayoutWidgets] = React.useState<IWidget[]>(widgets);
  const [layoutData, setLayoutData] = React.useState<ILayoutData>();
  React.useEffect(() => {
    setLayoutWidgets(widgets);
  }, [widgets]);

  // 布局更新与 Placeholder
  const engineRef = React.useRef<GridLayoutEngine | null>(null);
  const [activeWidgetId, setActiveWidgetId] = React.useState<string>();
  const [activeWidget, setActiveWidget] = React.useState<IWidget>();
  // 根据 widgets 组件数组，实例化布局引擎
  React.useEffect(() => {
    if (widgets && layoutData?.cols) {
      engineRef.current = new GridLayoutEngine(
        widgets.map((w) => GridLayoutEngine.widget2GridNode(w)),
        layoutData.cols,
        float,
      );
      if (initCompact) {
        engineRef.current.compact('compact', false);
        setLayoutWidgets(engineRef.current.getWidgets());
      }
    }
    return () => {
      engineRef.current = null;
    };
    // 只有当 cols 数目和 widgets 数组改变时，才重新实例化布局引擎
  }, [float, layoutData?.cols, widgets, initCompact]);
  React.useEffect(() => {
    if (engineRef.current && layoutData) {
      engineRef.current.setLayoutData(layoutData);
    }
  }, [layoutData]);

  const handleActionStart = React.useCallback((widget: IWidget, eventType: 'drag' | 'resize') => {
    setActiveWidgetId(widget.id);
    setActiveWidget(widget);
    const engine = engineRef.current;
    if (!engine) return;
    console.log('start', engine.nodes);
    const node = engine.nodes.find((n) => n.id === widget.id);
    if (node) {
      engine.cleanNodes().beginUpdate(node);
      node._moving = eventType === 'drag';
      delete node._lastTried;
      engine.cacheRects();
    }
  }, []);

  const handleActionDoing = React.useCallback(
    (widget: IWidget, newWidgetPos: IWidgetPosition, newBoxPos: IBoxPosition, eventType: 'drag' | 'resize') => {
      if (!engineRef.current) return;
      console.log(`操作 widget === ${widget.id}`, newWidgetPos);
      const tempLayoutWidgets = layoutWidgets.slice(0);
      const curWidget = tempLayoutWidgets.find((w) => w.id === widget.id) as IWidget;
      setActiveWidget(curWidget);

      const engine = engineRef.current;
      if (!engine) return;

      const node = engine.nodes.find((n) => n.id === widget.id);
      if (!node) return;

      let resizing = false;
      if (eventType === 'drag') {
        if (node.x === newWidgetPos.x && node.y === newWidgetPos.y) return;
      } else if (eventType === 'resize') {
        if (node.w === newWidgetPos.w && node.h === newWidgetPos.h) return;
        if (node._lastTried && node._lastTried.w === newWidgetPos.w && node._lastTried.h === newWidgetPos.h) return;
        resizing = true;
      }
      node._lastTried = newWidgetPos;
      if (
        engine.moveNodeCheck(node, {
          ...newWidgetPos,
          rect: {
            ...newBoxPos,
          },
          resizing,
        })
      ) {
        engine.cacheRects();
        delete node._skipDown;
      }
      setLayoutWidgets(engine.getWidgets());
    },
    [layoutWidgets],
  );

  const handleActionEnd = React.useCallback(
    (widget: IWidget) => {
      console.log('engine = layout handleActionEnd');
      if (widget.id !== activeWidgetId) return;
      setActiveWidgetId('');
      setActiveWidget(undefined);
      const engine = engineRef.current;
      if (!engine) return;
      const node = engine.nodes.find((n) => n.id === widget.id);
      if (node) {
        delete node._moving;
        delete node._lastTried;
      }

      engine.endUpdate();
      setLayoutWidgets(engine.getWidgets());
    },
    [activeWidgetId],
  );

  const size = useSize(layoutRef);
  React.useEffect(() => {
    if (size && onSizeChange) {
      onSizeChange(size);
    }
  }, [onSizeChange, size]);
  const colWidth = React.useMemo<number>(() => {
    if (!size || !layoutRef.current) return 0;
    return size.width / col;
  }, [col, size]);
  const rowHeight = React.useMemo<number>(() => {
    if (!propsRowHieght) return colWidth;
    if (typeof propsRowHieght === 'number') return gap ? propsRowHieght * colWidth + gap[1] : propsRowHieght * colWidth;
    if (typeof propsRowHieght === 'string') {
      const height = parseFloat(propsRowHieght);
      return gap ? height + gap[1] : height;
    }
    return 0;
  }, [colWidth, gap, propsRowHieght]);
  /**
   * 设置 margin
   */
  React.useEffect(() => {
    if (!gap) return;
    if (gap[0] <= 0 || gap[1] <= 0) return;
    const container = layoutRef.current;
    if (!container) return;
    const xMargin = gap[0] * 0.5;
    const yMargin = gap[1] * 0.5;
    container.style.marginLeft = `${-xMargin}px`;
    container.style.marginRight = `${-xMargin}px`;
    container.style.marginTop = `${-yMargin}px`;
    container.style.marginBottom = `${-yMargin}px`;
  }, [gap]);

  /**
   * 根据 props 和布局框架 size 变动，更新子节点
   */
  const [clonedChildren, setClonedChildren] = React.useState<React.ReactElement<IWidgetProps>[]>([]);
  React.useEffect(() => {
    const tempList: Array<{
      id: string;
      widget: IWidget;
      child: React.ReactElement<IWidgetProps>;
    }> = [];
    let rowCount = 0;

    React.Children.toArray(children).forEach((child) => {
      const curChild = child as React.ReactElement<IWidgetProps>;
      const { id } = curChild.props;
      const widgetConfig = layoutWidgets.find((w) => w.id === id);
      if (!widgetConfig) return;

      const bottom = widgetConfig.h + widgetConfig.y;
      rowCount = Math.max(rowCount, bottom);
      tempList.push({
        id,
        widget: widgetConfig,
        child: curChild,
      });
    });

    const _layoutData = {
      rows: rowCount,
      cols: col,
      width: colWidth * col,
      height: rowHeight * rowCount,
      rowHeight,
      colWidth,
      gap,
    };
    setLayoutData(_layoutData);
    const realChildren = tempList.map((item) =>
      React.cloneElement(item.child, {
        id: item.id,
        widget: item.widget,
        draggableHandle: item.child.props.draggableHandle || draggableHandle,
        resizeableHandle: item.child.props.resizeableHandle || resizeableHandle,
        layoutData: _layoutData,
        onActionStart: handleActionStart,
        onActionDoing: handleActionDoing,
        onActionEnd: handleActionEnd,
      }),
    );
    setClonedChildren(realChildren);
    if (layoutRef.current) {
      layoutRef.current.style.height = `${rowCount * rowHeight}px`;
    }
  }, [
    children,
    col,
    colWidth,
    draggableHandle,
    gap,
    handleActionDoing,
    handleActionEnd,
    handleActionStart,
    layoutWidgets,
    resizeableHandle,
    rowHeight,
    widgets,
  ]);

  return (
    <Wrapper {...ret} ref={layoutRef}>
      {clonedChildren}
      <Placeholder show={!!activeWidgetId} widget={activeWidget} layoutData={layoutData} />
    </Wrapper>
  );
};

export default Layout;
