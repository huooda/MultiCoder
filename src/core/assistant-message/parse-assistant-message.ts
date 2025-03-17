import { AssistantMessageContent, TextContent, ToolUse, ToolParamName, toolParamNames, toolUseNames, ToolUseName } from "."

export function parseAssistantMessage(assistantMessage: string) {
	let contentBlocks: AssistantMessageContent[] = []
	let currentTextContent: TextContent | undefined = undefined
	let currentTextContentStartIndex = 0
	let currentToolUse: ToolUse | undefined = undefined
	let currentToolUseStartIndex = 0
	let currentParamName: ToolParamName | undefined = undefined
	let currentParamValueStartIndex = 0
	let accumulator = ""

	for (let i = 0; i < assistantMessage.length; i++) {
		const char = assistantMessage[i]
		accumulator += char

		// there should not be a param without a tool use
		if (currentToolUse && currentParamName) {
			const currentParamValue = accumulator.slice(currentParamValueStartIndex)
			const paramClosingTag = `</${currentParamName}>`
			if (currentParamValue.endsWith(paramClosingTag)) {
				// end of param value
				currentToolUse.params[currentParamName] = currentParamValue.slice(0, -paramClosingTag.length).trim()
				currentParamName = undefined
				continue
			} else {
				// partial param value is accumulating
				continue
			}
		}

		// no currentParamName

		if (currentToolUse) {
			const currentToolValue = accumulator.slice(currentToolUseStartIndex)
			const toolUseClosingTag = `</${currentToolUse.name}>`
			if (currentToolValue.endsWith(toolUseClosingTag)) {
				// end of a tool use
				currentToolUse.partial = false
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined
				continue
			} else {
				const possibleParamOpeningTags = toolParamNames.map((name) => `<${name}>`)
				for (const paramOpeningTag of possibleParamOpeningTags) {
					if (accumulator.endsWith(paramOpeningTag)) {
						// start of a new parameter
						currentParamName = paramOpeningTag.slice(1, -1) as ToolParamName
						currentParamValueStartIndex = accumulator.length
						break
					}
				}

				// there's no current param, and not starting a new param

				// special case for write_to_file where file contents could contain the closing tag, in which case the param would have closed and we end up with the rest of the file contents here. To work around this, we get the string between the starting content tag and the LAST content tag.
				const contentParamName: ToolParamName = "content"
				if (currentToolUse.name === "write_to_file" && accumulator.endsWith(`</${contentParamName}>`)) {
					const toolContent = accumulator.slice(currentToolUseStartIndex)
					const contentStartTag = `<${contentParamName}>`
					const contentEndTag = `</${contentParamName}>`
					const contentStartIndex = toolContent.indexOf(contentStartTag) + contentStartTag.length
					const contentEndIndex = toolContent.lastIndexOf(contentEndTag)
					if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
						currentToolUse.params[contentParamName] = toolContent.slice(contentStartIndex, contentEndIndex).trim()
					}
				}
				
				// 特殊处理create_coder_agent工具的参数
				if (currentToolUse.name === "create_coder_agent") {
					const toolContent = accumulator.slice(currentToolUseStartIndex)
					
					// 处理task_description参数
					const taskDescParamName = "task_description"
					const taskDescStartTag = `<${taskDescParamName}>`
					const taskDescEndTag = `</${taskDescParamName}>`
					const taskDescStartIndex = toolContent.indexOf(taskDescStartTag) + taskDescStartTag.length
					const taskDescEndIndex = toolContent.indexOf(taskDescEndTag, taskDescStartIndex)
					if (taskDescStartIndex !== -1 && taskDescEndIndex !== -1 && taskDescEndIndex > taskDescStartIndex) {
						currentToolUse.params[taskDescParamName] = toolContent.slice(taskDescStartIndex, taskDescEndIndex).trim()
						console.log(`Found task_description: ${currentToolUse.params[taskDescParamName]}`)
					}
					
					// 处理code_style参数
					const codeStyleParamName = "code_style"
					const codeStyleStartTag = `<${codeStyleParamName}>`
					const codeStyleEndTag = `</${codeStyleParamName}>`
					const codeStyleStartIndex = toolContent.indexOf(codeStyleStartTag) + codeStyleStartTag.length
					const codeStyleEndIndex = toolContent.indexOf(codeStyleEndTag, codeStyleStartIndex)
					if (codeStyleStartIndex !== -1 && codeStyleEndIndex !== -1 && codeStyleEndIndex > codeStyleStartIndex) {
						currentToolUse.params[codeStyleParamName] = toolContent.slice(codeStyleStartIndex, codeStyleEndIndex).trim()
						console.log(`Found code_style: ${currentToolUse.params[codeStyleParamName]}`)
					}
					
					// 处理requirements参数
					const requirementsParamName = "requirements"
					const reqStartTag = `<${requirementsParamName}>`
					const reqEndTag = `</${requirementsParamName}>`
					const reqStartIndex = toolContent.indexOf(reqStartTag) + reqStartTag.length
					const reqEndIndex = toolContent.indexOf(reqEndTag, reqStartIndex)
					if (reqStartIndex !== -1 && reqEndIndex !== -1 && reqEndIndex > reqStartIndex) {
						currentToolUse.params[requirementsParamName] = toolContent.slice(reqStartIndex, reqEndIndex).trim()
						console.log(`Found requirements: ${currentToolUse.params[requirementsParamName]}`)
					}
				}

				// partial tool value is accumulating
				continue
			}
		}

		// no currentToolUse

		let didStartToolUse = false
		const possibleToolUseOpeningTags = toolUseNames.map((name) => `<${name}>`)
		for (const toolUseOpeningTag of possibleToolUseOpeningTags) {
			if (accumulator.endsWith(toolUseOpeningTag)) {
				// start of a new tool use
				currentToolUse = {
					type: "tool_use",
					name: toolUseOpeningTag.slice(1, -1) as ToolUseName,
					params: {},
					partial: true,
				}
				currentToolUseStartIndex = accumulator.length
				// this also indicates the end of the current text content
				if (currentTextContent) {
					currentTextContent.partial = false
					// remove the partially accumulated tool use tag from the end of text (<tool)
					currentTextContent.content = currentTextContent.content
						.slice(0, -toolUseOpeningTag.slice(0, -1).length)
						.trim()
					contentBlocks.push(currentTextContent)
					currentTextContent = undefined
				}

				didStartToolUse = true
				break
			}
		}

		if (!didStartToolUse) {
			// no tool use, so it must be text either at the beginning or between tools
			if (currentTextContent === undefined) {
				currentTextContentStartIndex = i
			}
			currentTextContent = {
				type: "text",
				content: accumulator.slice(currentTextContentStartIndex).trim(),
				partial: true,
			}
		}
	}

	if (currentToolUse) {
		// stream did not complete tool call, add it as partial
		if (currentParamName) {
			// tool call has a parameter that was not completed
			currentToolUse.params[currentParamName] = accumulator.slice(currentParamValueStartIndex).trim()
		}
		contentBlocks.push(currentToolUse)
	}

	// Note: it doesnt matter if check for currentToolUse or currentTextContent, only one of them will be defined since only one can be partial at a time
	if (currentTextContent) {
		// stream did not complete text content, add it as partial
		contentBlocks.push(currentTextContent)
	}

	return contentBlocks
}
