import {
    Component,
    ContentChild,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    NgModule,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild,
} from '@angular/core';

export interface ChangeEvent {
    start?: number;
    end?: number;
}

@Component({
    selector: 'virtual-scroll,[virtualScroll]',
    exportAs: 'virtualScroll',
    template: `
    <div class="total-padding" [style.height]="scrollHeight + 'px'"></div>
    <div class="scrollable-content" #content [style.transform]="'translateY(' + topPadding + 'px)'"
     [style.webkitTransform]="'translateY(' + topPadding + 'px)'">
      <ng-content></ng-content>
    </div>
  `,
    host: {
        '[style.overflow-y]': "parentScroll ? 'hidden' : 'auto'"
    },
    styles: [`
    :host {
      overflow: hidden;
      position: relative;
	  display: block;
      -webkit-overflow-scrolling: touch;
    }
    .scrollable-content {
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      position: absolute;
    }
    .total-padding {
      width: 1px;
      opacity: 0;
    }
  `]
})
export class VirtualScrollComponent implements OnInit, OnChanges, OnDestroy {

    @Input()
    items: any[] = [];

    @Input()
    scrollbarWidth: number;

    @Input()
    scrollbarHeight: number;

    @Input()
    childWidth: number;

    @Input()
    childHeight: number;

    @Input()
    bufferAmount: number = 0;

    @Input()
    getItemSize: (item) => number;

    private refreshHandler = () => {
        this.refresh();
    };
    private _parentScroll: Element | Window;
    @Input()
    set parentScroll(element: Element | Window) {
        if (this._parentScroll === element) {
            return;
        }
        this.removeParentEventHandlers(this._parentScroll);
        this._parentScroll = element;
        this.addParentEventHandlers(this._parentScroll);
    }

    get parentScroll(): Element | Window {
        return this._parentScroll;
    }

    @Output()
    update: EventEmitter<any[]> = new EventEmitter<any[]>();
    viewPortItems: any[];

    @Output()
    change: EventEmitter<ChangeEvent> = new EventEmitter<ChangeEvent>();

    @Output()
    start: EventEmitter<ChangeEvent> = new EventEmitter<ChangeEvent>();

    @Output()
    end: EventEmitter<ChangeEvent> = new EventEmitter<ChangeEvent>();

    @ViewChild('content', { read: ElementRef })
    contentElementRef: ElementRef;

    @ContentChild('container')
    containerElementRef: ElementRef;

    topPadding: number;
    scrollHeight: number;
    previousStart: number;
    previousEnd: number;
    startupLoop: boolean = true;
    window = window;

    constructor(private element: ElementRef) { }

    @HostListener('scroll')
    onScroll() {
        this.refresh();
    }

    ngOnInit() {
        this.scrollbarWidth = 0; // this.element.nativeElement.offsetWidth - this.element.nativeElement.clientWidth;
        this.scrollbarHeight = 0; // this.element.nativeElement.offsetHeight - this.element.nativeElement.clientHeight;

        if (!this.getItemSize) {
            this.getItemSize = (item) => {
                return this.childHeight;
            }
        }
    }

    ngOnDestroy() {
        this.removeParentEventHandlers(this.parentScroll);
    }

    ngOnChanges(changes: SimpleChanges) {
        this.previousStart = undefined;
        this.previousEnd = undefined;
        const items = (changes as any).items || {};
        if ((changes as any).items != undefined && items.previousValue == undefined || (items.previousValue != undefined && items.previousValue.length === 0)) {
            this.startupLoop = true;
        }
        this.refresh();
    }

    refresh() {
        requestAnimationFrame(() => this.calculateItems());
    }

    scrollInto(item: any) {
        let el: Element = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;
        let offsetTop = this.getElementsOffset();
        let index: number = (this.items || []).indexOf(item);
        if (index < 0 || index >= (this.items || []).length) return;

        let d = this.calculateDimensions();

        let itemsHeightSum = this.getItemsSizeSumUpToIndex(this.items, Math.floor(index / d.itemsPerRow));
        let itemsHeightSumMin = this.getItemsSizeSumUpToIndex(this.items, Math.min(index, this.bufferAmount));

        el.scrollTop = (itemsHeightSum - itemsHeightSumMin);
        this.refresh();
    }

    private addParentEventHandlers(parentScroll: Element | Window) {
        if (parentScroll) {
            parentScroll.addEventListener('scroll', this.refreshHandler);
            if (parentScroll instanceof Window) {
                parentScroll.addEventListener('resize', this.refreshHandler);
            }
        }
    }

    private removeParentEventHandlers(parentScroll: Element | Window) {
        if (parentScroll) {
            parentScroll.removeEventListener('scroll', this.refreshHandler);
            if (parentScroll instanceof Window) {
                parentScroll.removeEventListener('resize', this.refreshHandler);
            }
        }
    }

    private countItemsPerRow() {
        let offsetTop;
        let itemsPerRow;
        let children = this.contentElementRef.nativeElement.children;
        for (itemsPerRow = 0; itemsPerRow < children.length; itemsPerRow++) {
            if (offsetTop != undefined && offsetTop !== children[itemsPerRow].offsetTop) break;
            offsetTop = children[itemsPerRow].offsetTop;
        }
        return itemsPerRow;
    }

    private getElementsOffset(): number {
        let offsetTop = 0;
        if (this.containerElementRef && this.containerElementRef.nativeElement) {
            offsetTop += this.containerElementRef.nativeElement.offsetTop;
        }
        if (this.parentScroll) {
            offsetTop += this.element.nativeElement.offsetTop;
        }
        return offsetTop;
    }

    private calculateDimensions() {
        let el: Element = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;
        let items = this.items || [];
        let itemCount = items.length;
        let viewWidth = this.element.nativeElement.clientWidth;
        let viewHeight = this.element.nativeElement.clientHeight;

        let contentDimensions;
        if (this.childWidth == undefined || this.childHeight == undefined) {
            let content = this.contentElementRef.nativeElement;
            if (this.containerElementRef && this.containerElementRef.nativeElement) {
                content = this.containerElementRef.nativeElement;
            }
            contentDimensions = content.children[0] ? content.children[0].getBoundingClientRect() : {
                width: viewWidth,
                height: viewHeight
            };
        }
        let childWidth = this.childWidth || contentDimensions.width;
        let childHeight = this.childHeight || contentDimensions.height;

        let itemsPerRow = Math.max(1, this.countItemsPerRow());
        let itemsPerRowByCalc = Math.max(1, Math.floor(viewWidth / childWidth));
        var childrenHeightSum = 0;
        let itemsPerCol = 0;
        for (itemsPerCol = 0; itemsPerCol < items.length; itemsPerCol++) {
            childrenHeightSum += this.getItemSize(items[itemsPerCol]);
            if (childrenHeightSum > viewHeight)
                break;
        }

        itemsPerCol = Math.max(1, itemsPerCol);
        let scrollTop = Math.max(0, el.scrollTop);
        if (itemsPerCol === 1 && Math.floor(scrollTop / this.scrollHeight * itemCount) + itemsPerRowByCalc >= itemCount) {
            itemsPerRow = itemsPerRowByCalc;
        }

        return {
            itemCount: itemCount,
            viewWidth: viewWidth,
            viewHeight: viewHeight,
            childWidth: childWidth,
            childHeight: childHeight,
            itemsPerRow: itemsPerRow,
            itemsPerCol: itemsPerCol,
            itemsPerRowByCalc: itemsPerRowByCalc
        };
    }

    private getItemsSizeSumUpToIndex(items, index) {
        let sum = 0;
        for (let i = 0; i < index; i++) {
            let itemSize = this.getItemSize(items[i]);
            sum += itemSize;
        }

        return sum;
    }

    private calculateItems() {
        let el = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;

        let d = this.calculateDimensions();
        let items = this.items || [];
        let offsetTop = this.getElementsOffset();
        var itemsHeightSum = 0;

        items.forEach(item => {
            itemsHeightSum += this.getItemSize(item);
        });

        this.scrollHeight = itemsHeightSum / d.itemsPerRow;
        if (el.scrollTop > this.scrollHeight) {
            el.scrollTop = this.scrollHeight + offsetTop;
        }

        let scrollTop = Math.max(0, el.scrollTop - offsetTop);
        let indexByScrollTop = 0;
        let itemSizeSum = 0;
        for (indexByScrollTop = 0; indexByScrollTop < d.itemCount && itemSizeSum < scrollTop; indexByScrollTop++) {
            let itemSize = this.getItemSize(items[indexByScrollTop]);
            itemSizeSum += itemSize;
        }

        let start = indexByScrollTop;

        let viewHeight = this.element.nativeElement.clientHeight;
        itemSizeSum = 0;
        let i = start;
        for (; i < d.itemCount && itemSizeSum < viewHeight; i++) {
            let itemSize = this.getItemSize(items[i]);
            itemSizeSum += itemSize;
        }
        let end = i + 1;    

        start -= 1;
        this.topPadding = this.getItemsSizeSumUpToIndex(items, Math.ceil(start / d.itemsPerRow)) - (this.getItemsSizeSumUpToIndex(items, Math.min(start, this.bufferAmount)));

        start = !isNaN(start) ? start : -1;
        end = !isNaN(end) ? end : -1;
        start -= this.bufferAmount;
        start = Math.max(0, start);
        end += this.bufferAmount;
        end = Math.min(items.length, end);
        if (start !== this.previousStart || end !== this.previousEnd) {

            // update the scroll list
            this.viewPortItems = items.slice(start, end);
            this.update.emit(this.viewPortItems);

            // emit 'start' event
            if (start !== this.previousStart && this.startupLoop === false) {
                this.start.emit({ start, end });
            }

            // emit 'end' event
            if (end !== this.previousEnd && this.startupLoop === false) {
                this.end.emit({ start, end });
            }

            this.previousStart = start;
            this.previousEnd = end;

            if (this.startupLoop === true) {
                this.refresh();
            } else {
                this.change.emit({ start, end });
            }

        } else if (this.startupLoop === true) {
            this.startupLoop = false;
            this.refresh();
        }
    }
}

@NgModule({
    exports: [VirtualScrollComponent],
    declarations: [VirtualScrollComponent]
})
export class VirtualScrollModule { }
