import React, { createElement as e } from 'react'
import appendStyle from './append-style'
import {
  speedometerHi,
  speedometerLow,
  speedometerMed,
} from './base64icons'

// ================================================================================
// Constructor
// ================================================================================
class Drop extends React.Component {
    static get defaultProps() {
      return {
        label: 'Label',
        open: false,
        controlled: false,
        styleChildren: true,
        onDropToggled: null,
        direction: 'down',
        setSpeed: () => {},
      }
    }

    private css: any
    private el: any

    constructor(props: any) {
      super(props)
  // ================================================================================
  // Initial State
  // ================================================================================
    this.state = {
      open: true,
      speed: 0,
    }

  // ================================================================================
  // Bound Methods
  // ================================================================================
    this.onToggleClicked = this.onToggleClicked.bind(this)
    this.sliderOnChange = this.sliderOnChange.bind(this)

  // ================================================================================
  // Styles
  // ================================================================================
      this.css = () => `
        .drop {
          position: relative;
          width: 100px;
          height: 20px;
          border: 1px solid black;
          box-sizing: border-box;
          font-family: sans-serif;
          font-size: 11px;
          text-align: left;
        }

        .drop__toggle {
          position: absolute;
          width: 98px;
          height: 18px;
          line-height: 20px;
          background: #ccc;
          color: #000;
          cursor: pointer;
        }

        .drop__content {
          display: none;
          position: absolute;
          left: -1px;
          width: 100%;
          height: auto;
          border: 1px solid black;
        }

        .style-children .drop__content div,
        .style-children .drop__content a,
        .style-children .drop__content li{
          width: 98px;
          height: 18px;
          line-height: 20px;
          cursor: pointer;
        }

        .style-children .drop__content div:not(:last-child),
        .style-children .drop__content a:not(:last-child),
        .style-children .drop__content li:not(:last-child) {
          border-bottom: 1px solid black;
        }

        .drop.drop--down .drop__content {
          top: 100%;
        }

        .drop.drop--up .drop__content {
          bottom: 105px;
        }

        .drop.drop--open .drop__content {
          display: block;
        }
      `
  // ================================================================================
  // Class Properties
  // ================================================================================#
      this.el = null
    }

  // ================================================================================
  // Lifecycle
  // ================================================================================#
    componentDidMount() {
      appendStyle(this.css())
    }

  // ================================================================================
  // Handlers
  // ================================================================================
    onToggleClicked(evt: any) {
      evt.stopPropagation()

      if ((this.props as any).onDropToggled) {
        (this.props as any).onDropToggled()
      }

      if (!(this.props as any).controlled) {
        this.setState({ open: !(this.state as any).open })
      }
    }

    sliderOnChange(speed: number) {
      (this.props as any).setSpeed(speed)
      this.setState({speed})
    }

  // ================================================================================
  // Other Methods
  // ================================================================================
  // N/A

  // ================================================================================
  // Render
  // ================================================================================
    render() {
      const { direction, className, label, setSpeed, styleChildren, controlled } = this.props as any
      const { speed } = this.state as any
      const open = controlled ? (this.props as any).open : (this.state as any).open

      return (
        e('div', {
          className: 'drop drop--' + direction
            + (open ? ' drop--open' : '')
            + (styleChildren ? ' style-children' : '')
            + (className ? ' ' + className : null),
        },
          e('div', {
            className: 'drop__toggle',
            onClick: this.onToggleClicked,
          }),
          e('div', { className: 'drop__content'},
            e('div', {
              className: 'speed-icon speed-icon--hi',
              style: { backgroundImage: `url(data:image/gif;base64,${speedometerHi})` },
              onClick: () => setSpeed('hi')
            }),
            e('div', {
              className: 'speed-icon speed-icon--med',
              style: { backgroundImage: `url(data:image/gif;base64,${speedometerMed})` },
              onClick: () => setSpeed('med')
            }),
            e('div', {
              className: 'speed-icon speed-icon--low',
              style: { backgroundImage: `url(data:image/gif;base64,${speedometerLow})` },
              onClick: () => setSpeed('low')
            }),
          ),
        )
      )
    }
  }

  export default Drop
