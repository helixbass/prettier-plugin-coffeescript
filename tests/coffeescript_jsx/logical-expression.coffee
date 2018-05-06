<div>
  {a || 'b'}
</div>

<div>
  {a && 'b'}
</div>

<div>
  {a || <span></span>}
</div>

<div>
  {a and <span></span>}
</div>

<div>
  {if a then <span></span>}
</div>

<div>
  {<span></span> if a}
</div>

<div>
  {unless a then <span></span>}
</div>

<div>
  {<span></span> unless a}
</div>

<div>
  {a and <span>make this text just so long enough to break this to the next line</span>}
</div>

<div>
  {if a then <span>make this text just so long enough to break this to the next line</span>}
</div>

<div>
  {<span>make this text just so long enough to break this to the next line</span> if a}
</div>

<div>
  {a and b and <span>make this text just so long enough to break this to the next line</span>}
</div>

<div>
  {a and <span>
    <div>
      <div></div>
    </div>
  </span>}
</div>
