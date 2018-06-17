<div
  src={
    !isJellyfishEnabled &&
    diffUpdateMessageInput != null &&
    this.state.isUpdateMessageEmpty
  }
/>

<div>
  {not isJellyfishEnabled and
    diffUpdateMessageInput != null and
    @state.isUpdateMessageEmpty}
</div>

<div
  style={
    !isJellyfishEnabled &&
    diffUpdateMessageInput && {
      fontSize: 14,
      color: '#fff'
    }
  }
/>

<div>
  {!isJellyfishEnabled &&
    diffUpdateMessageInput != null && <div><span>Text</span></div>}
</div>

<div>
  {!isJellyfishEnabled &&
    diffUpdateMessageInput != null && child || <div><span>Text</span></div>}
</div>
