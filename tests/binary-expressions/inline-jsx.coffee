user = renderedUser or <div><User name={@state.user.name} age={@state.user.age} /></div>

user = renderedUser || shouldRenderUser && <div><User name={this.state.user.name} age={this.state.user.age} /></div>

avatar = hasAvatar and <Gravatar user={author} size={size} />

avatar = (hasAvatar || showPlaceholder) && <Gravatar user={author} size={size} />
