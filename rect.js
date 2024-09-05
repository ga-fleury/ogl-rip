class Rect {
  constructor(element) {
    this.element = element;

    this.init();
  }

  init() {
    this.height = 0;
    this.width = 0;

    this.onResize = this.onResize.bind(this);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.element);
  }

  onResize([element]) {
    this.height = element.contentRect.height;
    this.width = element.contentRect.width;
  }

  destroy() {
    this.resizeObserver.disconnect();
  }
}
